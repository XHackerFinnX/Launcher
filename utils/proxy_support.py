"""Proxy dependency hooks for network requests.

The launcher relies on requests honoring HTTP_PROXY/HTTPS_PROXY/ALL_PROXY
when users run VPN/VLESS clients through a local SOCKS proxy. PyInstaller may
miss PySocks because urllib3 imports SOCKS support dynamically, so importing
``socks`` here makes the dependency explicit for both normal runs and frozen
builds.
"""

import socks


def ensure_socks_proxy_support() -> None:
    """Keep PySocks reachable so requests can use socks:// proxy URLs."""
    # Touch a PySocks attribute so static analysis/freezers keep the module.
    _ = socks.PROXY_TYPE_SOCKS5