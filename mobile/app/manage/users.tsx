import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { Paginated, Role, UserDetail } from "@/src/api/types";
import { BigButton } from "@/src/components/BigButton";
import { ChipRow, Chip } from "@/src/components/Chip";
import { ModalSheet } from "@/src/components/ModalSheet";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "operator", label: "Operator" },
];

const ROLE_COLOR: Record<string, string> = {
  admin: colors.critical,
  supervisor: colors.primary,
  operator: colors.good,
};

function userLabel(user: UserDetail) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName ? `${fullName} (${user.username})` : user.username;
}

function UserDetailModal({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>(user.roles[0] ?? "operator");
  const [roleError, setRoleError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const assignRoleMutation = useMutation({
    mutationFn: async () => api.post(`/users/${user.id}/assign_role/`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", "management"] });
      onClose();
    },
    onError: () => setRoleError("Failed to change role."),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => api.post(`/users/${user.id}/reset_password/`, { new_password: newPassword }),
    onSuccess: () => setPasswordDone(true),
    onError: () => setPasswordError("Failed to reset password."),
  });

  return (
    <ModalSheet visible title={userLabel(user)}>
      <Text style={styles.modalLabel}>Role</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {ROLE_OPTIONS.map((opt) => (
          <Chip key={opt.value} label={opt.label} selected={role === opt.value} onPress={() => setRole(opt.value)} />
        ))}
      </ChipRow>
      {roleError && <Text style={styles.error}>{roleError}</Text>}
      <BigButton
        label={assignRoleMutation.isPending ? "Saving…" : "Save Role"}
        variant="secondary"
        onPress={() => {
          setRoleError(null);
          assignRoleMutation.mutate();
        }}
        disabled={assignRoleMutation.isPending}
      />

      <View style={styles.divider} />

      <Text style={styles.modalLabel}>Reset Password</Text>
      {passwordDone ? (
        <Text style={styles.success}>Password changed.</Text>
      ) : (
        <>
          <TextField
            placeholder="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureToggle
            style={{ marginBottom: spacing.sm }}
          />
          <TextField
            placeholder="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureToggle
            style={{ marginBottom: spacing.sm }}
          />
          {passwordError && <Text style={styles.error}>{passwordError}</Text>}
          <BigButton
            label={resetPasswordMutation.isPending ? "Resetting…" : "Reset Password"}
            variant="secondary"
            onPress={() => {
              setPasswordError(null);
              if (!newPassword || newPassword !== confirmPassword) {
                setPasswordError("Passwords do not match.");
                return;
              }
              resetPasswordMutation.mutate();
            }}
            disabled={resetPasswordMutation.isPending}
          />
        </>
      )}

      <View style={{ marginTop: spacing.md }}>
        <BigButton label="Close" onPress={onClose} />
      </View>
    </ModalSheet>
  );
}

export default function ManageUsersScreen() {
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", "management"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserDetail>>("/users/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const users = usersQuery.data ?? [];

  return (
    <Screen onRefresh={() => usersQuery.refetch()} refreshing={usersQuery.isRefetching}>
      <Text style={styles.title}>Users</Text>

      {usersQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {usersQuery.isError && <Text style={styles.error}>Failed to load users.</Text>}

      {users.map((user) => (
        <Pressable key={user.id} onPress={() => setSelectedUser(user)} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.username}>{user.username}</Text>
            {!user.is_active && <StatusPill label="Disabled" color={colors.textMuted} />}
          </View>
          <Text style={styles.fullName}>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</Text>
          <ChipRow style={{ marginTop: spacing.xs }}>
            {user.roles.map((role) => (
              <View key={role} style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[role] }]}>
                <Text style={styles.roleBadgeText}>{role}</Text>
              </View>
            ))}
          </ChipRow>
        </Pressable>
      ))}

      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
  },
  muted: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  error: {
    fontSize: fontSize.label,
    color: colors.critical,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  success: {
    fontSize: fontSize.label,
    color: colors.good,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
    ...shadow,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  username: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  fullName: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onStatus,
    textTransform: "capitalize",
  },
  modalLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
});
