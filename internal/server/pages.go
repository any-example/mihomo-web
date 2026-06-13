package server

import (
	"encoding/json"
	"html/template"
	"net/http"
	"strings"
)

type pageData struct {
	Title        string
	Page         string
	FixedTarget  bool
	MihomoURL    string
	MihomoSecret string
	AuthEnabled  bool
	ReadOnly     bool
	Build        BuildInfo
	ClientConfig template.JS
}

func (s *Server) page(name string, title string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		data := pageData{
			Title:        title,
			Page:         name,
			FixedTarget:  s.cfg.MihomoURL != "",
			MihomoURL:    s.cfg.MihomoURL,
			MihomoSecret: s.cfg.MihomoSecret,
			AuthEnabled:  s.cfg.UISecret != "",
			ReadOnly:     s.cfg.ReadOnly,
			Build:        normalizeBuildInfo(s.cfg.Build),
		}
		data.ClientConfig = clientConfig(data)
		if err := s.templates.ExecuteTemplate(w, "layout", data); err != nil {
			s.logger.Printf("render template: %v", err)
		}
	}
}

func (s *Server) redirect(target string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target, http.StatusFound)
	}
}

func (s *Server) loginPage(w http.ResponseWriter, r *http.Request) {
	if s.cfg.UISecret == "" {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	data := pageData{Title: "登录", Page: "login", AuthEnabled: true, ReadOnly: s.cfg.ReadOnly, Build: normalizeBuildInfo(s.cfg.Build)}
	data.ClientConfig = clientConfig(data)
	if err := s.templates.ExecuteTemplate(w, "layout", data); err != nil {
		s.logger.Printf("render login template: %v", err)
	}
}

func normalizeBuildInfo(build BuildInfo) BuildInfo {
	build.Version = normalizeBuildField(build.Version, "dev")
	build.Commit = normalizeBuildField(build.Commit, "未注入")
	build.Date = normalizeBuildField(build.Date, "未注入")
	return build
}

func normalizeBuildField(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	switch strings.ToLower(trimmed) {
	case "unknown", "unknow", "n/a", "na", "null":
		return fallback
	}
	return trimmed
}

func clientConfig(data pageData) template.JS {
	payload := map[string]any{
		"page":         data.Page,
		"fixedTarget":  data.FixedTarget,
		"mihomoURL":    data.MihomoURL,
		"mihomoSecret": data.MihomoSecret,
		"authEnabled":  data.AuthEnabled,
		"readOnly":     data.ReadOnly,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return template.JS("{}")
	}
	return template.JS(b)
}
