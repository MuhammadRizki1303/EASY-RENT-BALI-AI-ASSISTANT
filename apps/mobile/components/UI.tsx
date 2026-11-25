import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: ButtonProps) {
  const background =
    variant === 'danger' ? colors.error : variant === 'secondary' ? colors.surface : colors.teal;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        variant === 'secondary' && styles.secondaryButton,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && { color: colors.navy },
          variant === 'danger' && { color: colors.surface },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusBadge({
  label,
  tone = 'success',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'neutral';
}) {
  const toneColor =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : colors.secondaryText;

  return (
    <View style={[styles.badge, { backgroundColor: `${toneColor}14` }]}>
      <View style={[styles.badgeDot, { backgroundColor: toneColor }]} />
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function LoadingIndicator({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="small" color={colors.teal} />
      {label ? <Text style={styles.loadingText}>{label}</Text> : null}
    </View>
  );
}

export function TypingIndicator() {
  return (
    <View style={[styles.messageBubble, styles.typing]}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.typingDot} />
      ))}
    </View>
  );
}

export function ConfirmationDialog({
  visible,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalDescription}>{description}</Text>
          <View style={styles.modalActions}>
            <PrimaryButton label="Kembali" onPress={onCancel} variant="secondary" />
            <PrimaryButton
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SectionTitle({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  style?: TextStyle;
}) {
  return (
    <View>
      <Text style={[styles.sectionTitle, style]}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    height: 28,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.secondaryText,
    marginLeft: spacing.sm,
  },
  messageBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  typing: {
    width: 64,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondaryText,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,43,69,0.42)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  modalDescription: {
    color: colors.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.secondaryText,
    fontSize: 13,
    marginTop: 4,
  },
});
