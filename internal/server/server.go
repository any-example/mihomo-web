package server

import (
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/ming/mihomo-web/internal/web"
)

// BuildInfo describes the running binary.
type BuildInfo struct {
	Version string
	Commit  string
	Date    string
}

// Config configures the HTTP server.
type Config struct {
	Listen       string
	MihomoURL    string
	MihomoSecret string
	UISecret     string
	ReadOnly     bool
	Build        BuildInfo
}

// Server owns the HTTP handlers for mihomo-web.
type Server struct {
	cfg       Config
	mux       *http.ServeMux
	templates *template.Template
	logger    *log.Logger
}

// New creates a server.
func New(cfg Config, logger *log.Logger) (*Server, error) {
	if strings.TrimSpace(cfg.Listen) == "" {
		cfg.Listen = "127.0.0.1:8080"
	}
	tmpl, err := template.ParseFS(web.Templates, "templates/*.gohtml")
	if err != nil {
		return nil, err
	}
	if logger == nil {
		logger = log.Default()
	}

	s := &Server{
		cfg:       cfg,
		mux:       http.NewServeMux(),
		templates: tmpl,
		logger:    logger,
	}
	if err := s.routes(); err != nil {
		return nil, err
	}
	return s, nil
}

// Handler returns the HTTP handler.
func (s *Server) Handler() http.Handler {
	return s.securityHeaders(s.mux)
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe() error {
	return http.ListenAndServe(s.cfg.Listen, s.Handler())
}

func (s *Server) routes() error {
	staticFS, err := fs.Sub(web.Static, "static")
	if err != nil {
		return err
	}
	s.mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	s.mux.HandleFunc("GET /{$}", s.withAuth(s.redirect("/proxies")))
	s.mux.HandleFunc("GET /home", s.withAuth(s.page("overview", "概览")))
	s.mux.HandleFunc("GET /proxies", s.withAuth(s.page("proxies", "代理")))
	s.mux.HandleFunc("GET /rules", s.withAuth(s.page("rules", "规则")))
	s.mux.HandleFunc("GET /connections", s.withAuth(s.page("connections", "连接")))
	s.mux.HandleFunc("GET /logs", s.withAuth(s.page("logs", "日志")))
	s.mux.HandleFunc("GET /backends", s.withAuth(s.page("backends", "mihomo 后端")))
	s.mux.HandleFunc("GET /config", s.withAuth(s.page("config", "配置")))
	s.mux.HandleFunc("GET /about", s.withAuth(s.page("about", "关于")))
	s.mux.HandleFunc("GET /login", s.loginPage)
	return nil
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}
