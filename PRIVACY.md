# Privacy

Pica Library is designed as a local-first library and reader. It does not require an advertising SDK or analytics SDK for core operation.

Data such as library metadata, cached covers/pages, local downloads, settings, reading position, shelf state, Pica credentials, LAN pairing information, and optional WebDAV configuration is used to provide the requested features. Network transmission occurs only when a feature requires the configured service: Pica, GitHub update delivery, a paired Desktop instance, or a user-configured WebDAV server.

Users should protect their Pica/WebDAV credentials and only pair with Desktop instances they control. Payment QR codes are static support links; this release does not automatically inspect payment history or infer that a payment occurred.
