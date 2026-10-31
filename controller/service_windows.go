package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	serviceName        = "FanControllerCore"
	serviceDisplayName = "Baridi - Fancontroller Core"
	serviceDescription = "Pilote les ventilateurs (courbes de température) et expose l'API locale utilisée par l'application Baridi - Fancontroller."
)

// winService adapte serve au cycle de vie imposé par le gestionnaire de services.
type winService struct{ addr string }

func (w *winService) Execute(_ []string, requests <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown
	status <- svc.Status{State: svc.StartPending}

	stop := make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- serve(w.addr, stop, nil) }()
	status <- svc.Status{State: svc.Running, Accepts: accepted}

	for {
		select {
		case c := <-requests:
			switch c.Cmd {
			case svc.Interrogate:
				status <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending}
				close(stop)
				// serve restaure le ventilateur (Cleanup) avant de rendre la main : on l'attend, avec un plafond.
				select {
				case <-done:
				case <-time.After(20 * time.Second):
				}
				return false, 0
			}
		case err := <-done:
			if err != nil {
				log.Println("service:", err)
				return false, 1
			}
			return false, 0
		}
	}
}

func runAsService(addr string) {
	if err := svc.Run(serviceName, &winService{addr: addr}); err != nil {
		log.Println("svc.Run:", err)
	}
}

// installService crée le service (démarrage automatique, LocalSystem) puis le démarre.
// Nécessite les droits administrateur. Si le service existe déjà, on se contente de le démarrer.
func installService() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if exe, err = filepath.EvalSymlinks(exe); err != nil {
		return err
	}

	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("gestionnaire de services inaccessible (droits administrateur requis ?) : %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		s, err = m.CreateService(serviceName, exe, mgr.Config{
			DisplayName: serviceDisplayName,
			Description: serviceDescription,
			StartType:   mgr.StartAutomatic,
		})
		if err != nil {
			return fmt.Errorf("création du service : %w", err)
		}
		// Redémarre le service s'il plante : le ventilateur ne doit pas rester sans pilote.
		_ = s.SetRecoveryActions([]mgr.RecoveryAction{
			{Type: mgr.ServiceRestart, Delay: 5 * time.Second},
			{Type: mgr.ServiceRestart, Delay: 15 * time.Second},
			{Type: mgr.ServiceRestart, Delay: 60 * time.Second},
		}, 24*60*60)
	}
	defer s.Close()

	if err := s.Start(); err != nil && !errors.Is(err, windows.ERROR_SERVICE_ALREADY_RUNNING) {
		return fmt.Errorf("démarrage du service : %w", err)
	}
	return nil
}

// uninstallService arrête puis supprime le service.
func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("gestionnaire de services inaccessible (droits administrateur requis ?) : %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil // déjà absent
	}
	defer s.Close()

	if st, err := s.Control(svc.Stop); err == nil {
		deadline := time.Now().Add(25 * time.Second)
		for st.State != svc.Stopped && time.Now().Before(deadline) {
			time.Sleep(300 * time.Millisecond)
			if st, err = s.Query(); err != nil {
				break
			}
		}
	}
	return s.Delete()
}

// serviceStatus renvoie "not-installed", "stopped" ou "running".
// IMPORTANT : accès en lecture seule (SC_MANAGER_CONNECT) — fonctionne sans droits administrateur,
// contrairement à mgr.Connect qui demande SC_MANAGER_ALL_ACCESS.
func serviceStatus() string {
	scm, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err != nil {
		return "not-installed"
	}
	defer windows.CloseServiceHandle(scm)

	name, _ := windows.UTF16PtrFromString(serviceName)
	h, err := windows.OpenService(scm, name, windows.SERVICE_QUERY_STATUS)
	if err != nil {
		return "not-installed"
	}
	defer windows.CloseServiceHandle(h)

	var st windows.SERVICE_STATUS
	if err := windows.QueryServiceStatus(h, &st); err != nil {
		return "stopped"
	}
	if st.CurrentState == windows.SERVICE_RUNNING || st.CurrentState == windows.SERVICE_START_PENDING {
		return "running"
	}
	return "stopped"
}
