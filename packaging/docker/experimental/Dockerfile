FROM debian:bookworm-slim

ARG PICA_PRODUCT_VERSION
ARG PICA_SOURCE_SHA

LABEL org.opencontainers.image.title="Pica Library Experimental Headless"
LABEL org.opencontainers.image.version="${PICA_PRODUCT_VERSION}"
LABEL org.opencontainers.image.revision="${PICA_SOURCE_SHA}"
LABEL org.opencontainers.image.source="https://github.com/Saber-Alter-Lily/pica-library"
LABEL org.opencontainers.image.description="Experimental local-only headless container; no remote Web port is exposed"

RUN mkdir -p /opt/pica /config \
    && chown -R 10001:10001 /opt/pica /config

COPY --chown=10001:10001 package/ /opt/pica/

ENV PICA_LIBRARY_DESKTOP_HOME=/config
ENV HOME=/config

WORKDIR /opt/pica
USER 10001:10001
STOPSIGNAL SIGTERM

ENTRYPOINT ["/opt/pica/runtime/bin/node", "/opt/pica/app/desktop.js", "--headless"]
