import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export type MainTab = 'chat' | 'lookup' | 'settings';

export function AppHeader({
  title,
  subtitle,
  onBack,
  onNew,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onNew?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityLabel="Kembali" onPress={onBack} style={styles.iconButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>ER</Text>
        </View>
      )}
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {onNew ? (
        <Pressable accessibilityLabel="Percakapan baru" onPress={onNew} style={styles.newButton}>
          <Text style={styles.newIcon}>+</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

export function BottomNavigation({
  active,
  onChange,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  const items: { key: MainTab; label: string; icon: string }[] = [
    { key: 'chat', label: 'Chat', icon: '◫' },
    { key: 'lookup', label: 'Booking', icon: '⌕' },
    { key: 'settings', label: 'Pengaturan', icon: '⚙' },
  ];

  return (
    <View style={styles.bottom}>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            onPress={() => onChange(item.key)}
            style={styles.tab}
          >
            <Text style={[styles.tabIcon, selected && styles.tabIconSelected]}>{item.icon}</Text>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  headerText: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  title: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.success,
    fontSize: 11,
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.softNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: colors.navy,
    fontSize: 30,
    lineHeight: 34,
    marginTop: -3,
  },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.softTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newIcon: {
    color: colors.teal,
    fontSize: 24,
    lineHeight: 27,
  },
  headerSpacer: {
    width: 40,
  },
  bottom: {
    height: 72,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    color: colors.secondaryText,
    fontSize: 19,
  },
  tabIconSelected: {
    color: colors.teal,
  },
  tabLabel: {
    color: colors.secondaryText,
    fontSize: 11,
    marginTop: 3,
  },
  tabLabelSelected: {
    color: colors.teal,
    fontWeight: '800',
  },
});
