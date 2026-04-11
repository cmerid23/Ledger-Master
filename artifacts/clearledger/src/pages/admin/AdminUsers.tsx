import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import { formatDate } from "@/lib/utils";
import { Users, ShieldCheck, ShieldOff, Trash2, RefreshCw } from "lucide-react";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  businessCount: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    adminFetch<AdminUser[]>("/api/admin/users")
      .then(setUsers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function promoteUser(userId: number, role: "admin" | "user") {
    setActionId(userId);
    try {
      await adminFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  }

  async function deleteUser(userId: number, email: string) {
    if (!confirm(`Delete user "${email}"? This will also delete all their businesses and data.`))
      return;
    setActionId(userId);
    try {
      await adminFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All registered users across the platform
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase">
                  User
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">
                  Joined
                </th>
                <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground uppercase">
                  Businesses
                </th>
                <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground uppercase">
                  Role
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{user.email}</div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-foreground text-xs font-medium">
                      {user.businessCount}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {user.role === "admin" && <ShieldCheck className="w-3 h-3" />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {user.role === "user" ? (
                        <button
                          onClick={() => promoteUser(user.id, "admin")}
                          disabled={actionId === user.id}
                          title="Promote to admin"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors border border-amber-200"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Make admin
                        </button>
                      ) : (
                        <button
                          onClick={() => promoteUser(user.id, "user")}
                          disabled={actionId === user.id}
                          title="Demote to user"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors border border-border"
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                          Demote
                        </button>
                      )}
                      <button
                        onClick={() => deleteUser(user.id, user.email)}
                        disabled={actionId === user.id}
                        title="Delete user"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Footer count */}
        {!loading && users.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
            {users.length} user{users.length !== 1 ? "s" : ""} total ·{" "}
            {users.filter((u) => u.role === "admin").length} admin
            {users.filter((u) => u.role === "admin").length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
