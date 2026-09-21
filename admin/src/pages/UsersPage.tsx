import { useEffect, useMemo, useState } from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import { listUsers } from '../lib/api';
import type { YonnbiUser } from '../lib/types';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^221/, '');
  const grouped = digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return `+221 ${grouped}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const [users, setUsers] = useState<YonnbiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.phone.includes(q) || (u.city ?? '').toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        subtitle={`${users.length} compte${users.length > 1 ? 's' : ''} créé${users.length > 1 ? 's' : ''} sur Yonnbi`}
      />

      {error && <div className="notice notice-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {!loading && users.length > 0 && (
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              type="search"
              placeholder="Chercher un nom, un numéro, une ville…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="spacer" />
        </div>
      )}

      {loading ? (
        <div className="centered-state">Chargement…</div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={28} />}
          title="Aucun compte pour le moment"
          description="Les comptes créés depuis l'app mobile apparaîtront ici."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search size={28} />} title="Aucun résultat" description="Essaie une autre recherche." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Ville</th>
                <th>Trajets</th>
                <th>Favoris</th>
                <th>Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar-circle">{u.full_name.trim().charAt(0).toUpperCase() || '?'}</div>
                      <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{formatPhone(u.phone)}</td>
                  <td>{u.city || <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                  <td>{u.saved_trips}</td>
                  <td>{u.favorite_lines}</td>
                  <td style={{ color: 'var(--ink-muted)' }}>{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
