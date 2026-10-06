"""
api/ssrf.py
===========
Descarga de páginas de terceros SIN que el servidor pueda ser usado para
alcanzar su propia red.

POR QUÉ EXISTE. `features/scrap_identity` baja el HTML de la URL que escribe una
persona, las hojas de estilo y el logo que ESA página enlaza. Expuesto por HTTP,
eso es un SSRF: alguien escribe `http://169.254.169.254/...` (metadatos del
proveedor), `http://localhost:10000/` o el nombre de un servicio interno, o sube
una página cuyo `<link rel=stylesheet>` apunta a uno de esos sitios, y el
servidor hace la petición por él.

QUÉ CIERRA:
  * solo http/https, puertos 80/443, sin usuario:clave en la URL;
  * el nombre se resuelve y TODAS las IP tienen que ser públicas (se rechazan
    privadas, loopback, link-local, multicast, reservadas, CGNAT, IPv4 mapeada);
  * las redirecciones se siguen a mano y CADA salto se valida otra vez;
  * tope de tamaño por respuesta y tope de tiempo total por extracción.

LÍMITE CONOCIDO. Entre la resolución y la conexión real el DNS podría cambiar
(DNS rebinding). Se acepta porque la petición es un GET, el cuerpo nunca se
devuelve tal cual (solo colores y un logo saneado) y los tiempos son cortos.

Se enchufa en `scrap_identity` reemplazando su `_get`, el único punto por donde
esa feature sale a internet (`instalar()`).
"""

from __future__ import annotations

import ipaddress
import socket
import threading
import time
from urllib.parse import urljoin, urlparse

import requests

MAX_REDIRECCIONES = 4
MAX_BYTES = 3_000_000                  # por respuesta; un CSS corporativo pesa <1 MB
PUERTOS_OK = {None, 80, 443}
TIMEOUT_CONEXION_LECTURA = (4, 10)     # segundos
_CGNAT = ipaddress.ip_network("100.64.0.0/10")

_contexto = threading.local()


class UrlNoPermitida(ValueError):
    """La URL apunta a algo que el servidor no debe tocar."""


class PresupuestoAgotado(TimeoutError):
    """La extracción pasó de su tiempo total."""


def _ip_publica(texto: str) -> bool:
    try:
        ip = ipaddress.ip_address(texto)
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if ip.version == 4 and ip in _CGNAT:
        return False
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified
    )


def validar_url(url: str) -> None:
    """Lanza `UrlNoPermitida` si la URL no se puede pedir con seguridad."""
    partes = urlparse(url or "")
    if partes.scheme not in ("http", "https"):
        raise UrlNoPermitida("Solo se permiten direcciones http o https.")
    if partes.username or partes.password:
        raise UrlNoPermitida("La dirección no puede llevar usuario ni clave.")
    host = (partes.hostname or "").strip().lower()
    if not host:
        raise UrlNoPermitida("La dirección no tiene dominio.")
    try:
        puerto = partes.port
    except ValueError as exc:
        raise UrlNoPermitida("Puerto inválido.") from exc
    if puerto not in PUERTOS_OK:
        raise UrlNoPermitida("Solo se permiten los puertos 80 y 443.")
    if host in ("localhost", "metadata.google.internal") or host.endswith((".local", ".internal", ".localhost")):
        raise UrlNoPermitida("Esa dirección no es pública.")

    # IP escrita directamente. OJO: `UrlNoPermitida` es un ValueError, así que el
    # `try` solo envuelve el parseo; la decisión va FUERA, o el `except` se la traga.
    try:
        ipaddress.ip_address(host)
        es_ip = True
    except ValueError:
        es_ip = False
    if es_ip:
        if not _ip_publica(host):
            raise UrlNoPermitida("Esa dirección no es pública.")
        return

    try:
        resueltas = socket.getaddrinfo(host, puerto or (443 if partes.scheme == "https" else 80),
                                       proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UrlNoPermitida("No pudimos encontrar ese dominio.") from exc
    if not resueltas:
        raise UrlNoPermitida("No pudimos encontrar ese dominio.")
    for *_, sockaddr in resueltas:
        if not _ip_publica(sockaddr[0]):
            raise UrlNoPermitida("Esa dirección no es pública.")


def empezar_presupuesto(segundos: float) -> None:
    """Fija el tiempo TOTAL que puede gastar la extracción en curso (este hilo)."""
    _contexto.limite = time.monotonic() + segundos


def terminar_presupuesto() -> None:
    _contexto.limite = None


def _revisar_presupuesto() -> None:
    limite = getattr(_contexto, "limite", None)
    if limite is not None and time.monotonic() > limite:
        raise PresupuestoAgotado("La página tardó demasiado en responder.")


def get_seguro(url, timeout=None, reintentos=None, **kwargs):
    """Sustituto de `scrap_identity.scrap._get`: mismo contrato, sin el SSRF.

    Devuelve un `requests.Response` ya leído (con tope de tamaño). Lanza
    `RuntimeError` cuando falla —incluida una URL prohibida—, como el original,
    para que quien lo llama siga tratando el error igual. Solo
    `PresupuestoAgotado` NO se convierte: corta toda la extracción.
    """
    from features.scrap_identity import scrap  # import tardío: evita el ciclo al instalar

    sesion = scrap._SESION
    actual = url
    ultimo_error = None
    for _salto in range(MAX_REDIRECCIONES + 1):
        _revisar_presupuesto()
        try:
            validar_url(actual)
        except UrlNoPermitida as exc:
            # Un recurso secundario prohibido (una hoja de estilos que apunta a
            # `localhost`, común en sitios con restos de desarrollo) se SALTA: es
            # un RuntimeError, que quien llama ya sabe tratar. La URL principal
            # se valida aparte, antes de empezar (ver `demo.extraer_marca`).
            raise RuntimeError(f"URL no permitida ({exc}): {actual}") from exc
        host = urlparse(actual).netloc
        verificar = host not in scrap._SIN_VERIFICAR
        try:
            r = sesion.get(actual, timeout=TIMEOUT_CONEXION_LECTURA, verify=verificar,
                           allow_redirects=False, stream=True)
        except requests.exceptions.SSLError as exc:
            # Mismo respaldo que el original: varias constructoras sirven la cadena TLS
            # incompleta. Solo se lee un color y un logo, así que no se pierde nada.
            ultimo_error = exc
            if verificar:
                scrap._SIN_VERIFICAR.add(host)
                continue
            break
        except requests.RequestException as exc:
            ultimo_error = exc
            break

        if r.is_redirect or r.status_code in (301, 302, 303, 307, 308):
            destino = r.headers.get("Location")
            r.close()
            if not destino:
                break
            actual = urljoin(actual, destino)
            continue

        try:
            r.raise_for_status()
        except requests.RequestException as exc:
            ultimo_error = exc
            r.close()
            break

        cuerpo = bytearray()
        for trozo in r.iter_content(65536):
            cuerpo.extend(trozo)
            if len(cuerpo) >= MAX_BYTES:
                break
            _revisar_presupuesto()
        r.close()
        r._content = bytes(cuerpo)
        r._content_consumed = True
        return r

    raise RuntimeError(f"GET falló en {url}: {ultimo_error or 'demasiadas redirecciones'}")


def instalar() -> None:
    """Reemplaza el `_get` de scrap_identity por la versión segura (idempotente)."""
    from features.scrap_identity import scrap

    if scrap._get is not get_seguro:
        scrap._get = get_seguro
