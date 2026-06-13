package server

import (
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTemplatesParseAndOverviewRenders(t *testing.T) {
	s := newTestServer(t, Config{MihomoURL: "http://127.0.0.1:9090", MihomoSecret: "secret"})
	req := httptest.NewRequest(http.MethodGet, "/home", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), "mihomo 状态概览") {
		t.Fatalf("overview page missing expected title")
	}
	if !strings.Contains(rec.Body.String(), `"page":"overview"`) {
		t.Fatalf("overview page missing plain JSON client config")
	}
	if !strings.Contains(rec.Body.String(), `"mihomoURL":"http://127.0.0.1:9090"`) {
		t.Fatalf("overview page missing mihomo url in client config")
	}
	if !strings.Contains(rec.Body.String(), `"mihomoSecret":"secret"`) {
		t.Fatalf("overview page missing mihomo secret in client config")
	}
	if !strings.Contains(rec.Body.String(), `"fixedTarget":true`) {
		t.Fatalf("overview page missing fixedTarget=true in client config")
	}
	if strings.Contains(rec.Body.String(), `\"overview\"`) {
		t.Fatalf("overview page contains double-escaped client config")
	}
}

func TestRootRedirectsToProxies(t *testing.T) {
	s := newTestServer(t, Config{})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
	}
	if got, want := rec.Header().Get("Location"), "/proxies"; got != want {
		t.Fatalf("Location = %q, want %q", got, want)
	}
}

func TestAuthRequiredForPage(t *testing.T) {
	s := newTestServer(t, Config{UISecret: "token"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
	}
	if got, want := rec.Header().Get("Location"), "/login"; got != want {
		t.Fatalf("Location = %q, want %q", got, want)
	}
}

func TestAuthCanBeDisabled(t *testing.T) {
	s := newTestServer(t, Config{})
	req := httptest.NewRequest(http.MethodGet, "/home", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestBackendsPageRenders(t *testing.T) {
	s := newTestServer(t, Config{})
	req := httptest.NewRequest(http.MethodGet, "/backends", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), "mihomo 后端") {
		t.Fatalf("backends page missing expected title")
	}
	if !strings.Contains(rec.Body.String(), `"page":"backends"`) {
		t.Fatalf("backends page missing client config page value")
	}
}

func TestBackendDoesNotServeMihomoAPI(t *testing.T) {
	s := newTestServer(t, Config{})
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func newTestServer(t *testing.T, cfg Config) *Server {
	t.Helper()
	s, err := New(cfg, log.Default())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return s
}
