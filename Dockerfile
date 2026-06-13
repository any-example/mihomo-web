FROM golang:1.23-alpine AS builder
ARG VERSION=dev
ARG COMMIT=unknown
ARG DATE=unknown
WORKDIR /src
COPY go.mod ./
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 go build -ldflags "-s -w \
  -X main._version=${VERSION} \
  -X main._commit=${COMMIT} \
  -X main._date=${DATE}" \
  -o /mihomo-web ./cmd/mihomo-web

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /mihomo-web /usr/local/bin/mihomo-web
EXPOSE 80
ENTRYPOINT ["mihomo-web"]
CMD ["--listen", ":80"]
