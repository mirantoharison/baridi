package fan

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"sync"
)

// ProfileStore persiste les profils utilisateur dans un fichier JSON lisible
// (éditable à la main). Les profils système restent en dur dans le code.
type ProfileStore struct {
	mu   sync.RWMutex
	path string
	user []Profile
}

func NewProfileStore(path string) (*ProfileStore, error) {
	s := &ProfileStore{path: path, user: []Profile{}}
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return s, nil
	case err != nil:
		return nil, err
	}
	if len(data) > 0 {
		if err := json.Unmarshal(data, &s.user); err != nil {
			return nil, fmt.Errorf("%s illisible: %w", path, err)
		}
	}
	for i := range s.user {
		s.user[i].Source = "user"
		if s.user[i].Transition.Step == 0 || s.user[i].Transition.TickMs == 0 {
			s.user[i].Transition = defaultTransition
		}
	}
	return s, nil
}

func (s *ProfileStore) GetAll() []Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := make([]Profile, 0, len(SystemProfiles)+len(s.user))
	all = append(all, SystemProfiles...)
	return append(all, s.user...)
}

func (s *ProfileStore) Get(id string) (Profile, bool) {
	for _, p := range s.GetAll() {
		if p.ID == id {
			return p, true
		}
	}
	return Profile{}, false
}

func isSystemID(id string) bool {
	for _, sys := range SystemProfiles {
		if sys.ID == id {
			return true
		}
	}
	return false
}

// Save crée ou met à jour un profil utilisateur puis réécrit le fichier.
func (s *ProfileStore) Save(p Profile) error {
	if isSystemID(p.ID) {
		return fmt.Errorf("cannot override system profile %q", p.ID)
	}
	if p.Name == "" {
		return errors.New("name is required")
	}
	// IMPORTANT : GetPWM parcourt les points dans l'ordre — il faut une courbe croissante en température.
	sort.SliceStable(p.Points, func(i, j int) bool { return p.Points[i].Temp < p.Points[j].Temp })
	for i := range p.Points {
		p.Points[i].Speed = min(max(p.Points[i].Speed, 0), 100)
	}
	p.Source = "user"
	if p.Transition.Step == 0 || p.Transition.TickMs == 0 {
		p.Transition = defaultTransition
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	replaced := false
	for i := range s.user {
		if s.user[i].ID == p.ID {
			s.user[i] = p
			replaced = true
			break
		}
	}
	if !replaced {
		s.user = append(s.user, p)
	}
	return s.flush()
}

func (s *ProfileStore) Delete(id string) error {
	if isSystemID(id) {
		return fmt.Errorf("cannot delete system profile %q", id)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	kept := s.user[:0]
	for _, p := range s.user {
		if p.ID != id {
			kept = append(kept, p)
		}
	}
	s.user = kept
	return s.flush()
}

// flush écrit via un fichier temporaire + rename pour ne jamais laisser un JSON tronqué.
func (s *ProfileStore) flush() error {
	data, err := json.MarshalIndent(s.user, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
