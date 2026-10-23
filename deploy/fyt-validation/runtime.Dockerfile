FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a
COPY foyton-api /foyton-api
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
WORKDIR /data
ENTRYPOINT ["/foyton-api"]
