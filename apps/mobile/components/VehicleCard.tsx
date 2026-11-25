import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { Vehicle } from '../services/api';
import { PrimaryButton, StatusBadge } from './UI';

interface Props {
  vehicle: Vehicle;
  onView: () => void;
  onBook: () => void;
  compact?: boolean;
}

export function VehicleCard({ vehicle, onView, onBook, compact }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable onPress={onView} accessibilityRole="button">
        <View style={styles.visual}>
          {vehicle.image_url && !imgError ? (
            <Image
              source={{ uri: vehicle.image_url }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={styles.carShape}>
              <View style={styles.carWindow} />
              <View style={styles.carWheelLeft} />
              <View style={styles.carWheelRight} />
            </View>
          )}
        </View>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {vehicle.brand} {vehicle.model}
            </Text>
            <Text style={styles.year}>{vehicle.year}</Text>
          </View>
          <StatusBadge
            label={
              vehicle.availability_status === 'AVAILABLE'
                ? 'Status umum: tersedia'
                : 'Status umum: tidak tersedia'
            }
            tone={vehicle.availability_status === 'AVAILABLE' ? 'success' : 'warning'}
          />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{vehicle.transmission}</Text>
          <View style={styles.metaDivider} />
          <Text style={styles.meta}>{vehicle.seats} seats</Text>
          <View style={styles.metaDivider} />
          <Text style={styles.meta}>{vehicle.fuel_type}</Text>
        </View>
        <View style={styles.footer}>
          <View>
            <Text style={styles.price}>Rp {vehicle.daily_price.toLocaleString('id-ID')}</Text>
            <Text style={styles.perDay}>per day</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton label="Detail" onPress={onView} variant="secondary" />
            <PrimaryButton label="Pesan" onPress={onBook} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  compact: {
    marginRight: spacing.md,
  },
  visual: {
    height: 140,
    backgroundColor: colors.softNavy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  carShape: {
    width: 190,
    height: 62,
    borderRadius: 30,
    backgroundColor: '#AEBBC8',
    marginTop: 28,
  },
  carWindow: {
    position: 'absolute',
    width: 78,
    height: 28,
    borderRadius: 18,
    backgroundColor: '#DDE7ED',
    left: 56,
    top: -17,
  },
  carWheelLeft: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.navy,
    left: 28,
    bottom: -10,
  },
  carWheelRight: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.navy,
    right: 28,
    bottom: -10,
  },
  content: {
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  name: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
  },
  year: {
    color: colors.secondaryText,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  meta: {
    color: colors.secondaryText,
    fontSize: 12,
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  price: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  perDay: {
    color: colors.secondaryText,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
