import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppHeader } from './components/Navigation';
import { PrimaryButton, SectionTitle, StatusBadge, TypingIndicator } from './components/UI';
import { VehicleCard } from './components/VehicleCard';
import { colors, radius, spacing } from './constants/theme';
import { AdminOverview, Booking, getFeatures, HealthStatus, Payment, PaymentSummary, User, Vehicle, api } from './services/api';

export function SplashScreen() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashMark}>
        <Text style={styles.splashMarkText}>ER</Text>
      </View>
      <Text style={styles.splashTitle}>Easy Rent Bali</Text>
      <Text style={styles.splashSubtitle}>AI Rental Assistant</Text>
    </View>
  );
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  vehicles?: Vehicle[];
  booking?: Booking;
  speakable?: boolean;
}

export function ChatScreen({
  messages,
  typing,
  sending,
  input,
  setInput,
  onSend,
  onPrompt,
  onVehicleDetails,
  onVehicleBook,
  onSpeak,
  speechLoadingId,
  speechPlayingId,
  speechErrorId,
  speechError,
  backendStatus,
  mcpStatus,
}: {
  messages: ChatMessage[];
  typing: boolean;
  sending: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onPrompt: (text: string) => void;
  onVehicleDetails: (vehicle: Vehicle) => void;
  onVehicleBook: (vehicle: Vehicle) => void;
  onSpeak: (messageId: string, text: string) => void;
  speechLoadingId: string | null;
  speechPlayingId: string | null;
  speechErrorId: string | null;
  speechError: string | null;
  backendStatus: HealthStatus['status'];
  mcpStatus: HealthStatus['status'];
}) {
  const prompts = [
    'Cari mobil yang tersedia',
    'Cek harga sewa',
    'Cek ketersediaan kendaraan',
    'Saya ingin booking',
    'Cek booking saya',
  ];

  return (
    <View style={styles.chatRoot}>
      <ScrollView
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View>
            <View style={styles.welcome}>
              <Text style={styles.welcomeTitle}>Hello! Welcome to Easy Rent Bali.</Text>
              <Text style={styles.welcomeSubtitle}>
                How can I help you find your perfect rental car today?
              </Text>
            </View>
            <Text style={styles.promptTitle}>Mulai dengan cepat</Text>
            <View style={styles.promptGrid}>
              {prompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  accessibilityRole="button"
                  disabled={sending}
                  onPress={() => onPrompt(prompt)}
                  style={styles.promptChip}
                >
                  <Text style={styles.promptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((message) => (
          <View key={message.id}>
            <View
              style={[
                styles.messageRow,
                message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
              ]}
            >
              {message.role === 'assistant' && (
                <View style={styles.assistantAvatar}>
                  <Text style={styles.assistantAvatarText}>ER</Text>
                </View>
              )}
              <View
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[styles.messageText, message.role === 'user' && { color: colors.surface }]}
                >
                  {message.text}
                </Text>
                {message.role === 'assistant' &&
                  message.speakable !== false &&
                  !message.id.endsWith('-error') &&
                  Boolean(message.text.trim()) && (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          speechPlayingId === message.id ? 'Hentikan suara' : 'Dengarkan jawaban'
                        }
                        disabled={speechLoadingId !== null && speechLoadingId !== message.id}
                        onPress={() => onSpeak(message.id, message.text)}
                        style={styles.speechButton}
                      >
                        <Text style={styles.speechButtonText}>
                          {speechLoadingId === message.id
                            ? 'Membuat audio…'
                            : speechPlayingId === message.id
                              ? 'Hentikan'
                              : '▶ Dengarkan'}
                        </Text>
                      </Pressable>
                      {speechErrorId === message.id && speechError && (
                        <Text accessibilityRole="alert" style={styles.speechError}>
                          {speechError}
                        </Text>
                      )}
                    </>
                  )}
              </View>
            </View>
            {message.vehicles?.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleResult}>
                <VehicleCard
                  vehicle={vehicle}
                  onView={() => onVehicleDetails(vehicle)}
                  onBook={() => onVehicleBook(vehicle)}
                />
              </View>
            ))}
            {message.booking && <BookingSummary booking={message.booking} />}
          </View>
        ))}

        {typing && (
          <View style={styles.messageRowAssistant}>
            <View style={styles.assistantAvatar}>
              <Text style={styles.assistantAvatarText}>ER</Text>
            </View>
            <TypingIndicator />
          </View>
        )}
      </ScrollView>

      <View style={styles.connectionRow}>
        <StatusBadge
          label={backendStatus === 'connected' ? 'Backend online' : 'Backend offline'}
          tone={backendStatus === 'connected' ? 'success' : 'warning'}
        />
        <StatusBadge
          label={mcpStatus === 'connected' ? 'MCP connected' : 'MCP unavailable'}
          tone={mcpStatus === 'connected' ? 'success' : 'warning'}
        />
      </View>
      <View style={styles.chatInputWrap}>
        <TextInput
          accessibilityLabel="Pesan"
          value={input}
          onChangeText={setInput}
          placeholder="Tulis pesan..."
          placeholderTextColor={colors.secondaryText}
          multiline
          editable={!sending}
          onSubmitEditing={onSend}
          style={styles.chatInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kirim pesan"
          disabled={!input.trim() || sending}
          onPress={onSend}
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendIcon}>{sending ? '…' : '↑'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BookingSummary({
  booking,
  payments,
  paymentSummary,
  onPay,
  paying,
}: {
  booking: Booking;
  payments?: Payment[];
  paymentSummary?: PaymentSummary;
  onPay?: (method: 'QRIS' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'OVO' | 'GOPAY' | 'DANA' | 'CASH') => void;
  paying?: boolean;
}) {
  const isPaid = booking.booking_status === 'CONFIRMED' || (paymentSummary?.isFullyPaid ?? false);
  const remaining = paymentSummary ? paymentSummary.remainingAmount : (isPaid ? 0 : booking.total_estimated_price);

  return (
    <View style={styles.bookingSummary}>
      <View style={styles.bookingSummaryHeader}>
        <Text style={styles.bookingRef}>{booking.booking_reference}</Text>
        <StatusBadge
          label={booking.booking_status}
          tone={
            booking.booking_status === 'CONFIRMED'
              ? 'success'
              : booking.booking_status === 'CANCELLED'
                ? 'neutral'
                : 'warning'
          }
        />
      </View>
      <Text style={styles.bookingName}>{booking.customer_name}</Text>
      <Text style={styles.bookingMeta}>
        {booking.vehicle_id} • {booking.start_date} – {booking.end_date}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.md }}>
        <View>
          <Text style={{ fontSize: 11, color: colors.secondaryText }}>Total Biaya:</Text>
          <Text style={styles.bookingPrice}>
            Rp {booking.total_estimated_price.toLocaleString('id-ID')}
          </Text>
        </View>
        {paymentSummary && paymentSummary.totalPaid > 0 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: colors.secondaryText }}>Sudah Dibayar:</Text>
            <Text style={{ color: colors.teal, fontSize: 14, fontWeight: '700' }}>
              Rp {paymentSummary.totalPaid.toLocaleString('id-ID')}
            </Text>
          </View>
        )}
      </View>

      {/* Payment Action Section */}
      {booking.booking_status !== 'CANCELLED' && remaining > 0 && onPay && (
        <View style={styles.paymentBox}>
          <Text style={styles.paymentBoxTitle}>Pilih Metode Pembayaran</Text>
          <Text style={styles.paymentBoxSubtitle}>
            Selesaikan pembayaran untuk mengonfirmasi sewa kendaraan Anda.
          </Text>
          <View style={styles.paymentMethodGrid}>
            {(['QRIS', 'OVO', 'GOPAY', 'DANA', 'BANK_TRANSFER', 'CREDIT_CARD', 'CASH'] as const).map((method) => (
              <Pressable
                key={method}
                disabled={paying}
                onPress={() => onPay(method)}
                style={[
                  styles.paymentMethodButton,
                  method === 'QRIS' && { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
                  method === 'CASH' && { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
                  paying && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[
                    styles.paymentMethodText,
                    method === 'QRIS' && { color: '#0369A1' },
                    method === 'CASH' && { color: '#B45309' },
                  ]}
                >
                  {method === 'BANK_TRANSFER' ? 'Transfer Bank' : method === 'CASH' ? '💵 Bayar Tunai (Cash)' : method}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Success Badge when fully confirmed & paid */}
      {isPaid && (
        <View style={styles.paidConfirmationBox}>
          <Text style={styles.paidConfirmationText}>
            ✓ Booking telah CONFIRMED & Pembayaran Lunas!
          </Text>
        </View>
      )}
    </View>
  );
}

export function VehicleDetails({
  vehicle,
  onBack,
  onBook,
}: {
  vehicle: Vehicle;
  onBack: () => void;
  onBook: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const features = getFeatures(vehicle);
  return (
    <View style={styles.flex}>
      <AppHeader title="Detail Kendaraan" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.detailVisual}>
          {vehicle.image_url && !imgError ? (
            <Image
              source={{ uri: vehicle.image_url }}
              style={styles.detailImage}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <>
              <View style={styles.detailCarBody}>
                <View style={styles.detailWindow} />
                <View style={styles.detailWheelLeft} />
                <View style={styles.detailWheelRight} />
              </View>
              <Text style={styles.imagePlaceholder}>Gambar kendaraan belum tersedia</Text>
            </>
          )}
        </View>
        <View style={styles.detailTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>
              {vehicle.brand} {vehicle.model}
            </Text>
            <Text style={styles.detailYear}>{vehicle.year}</Text>
          </View>
          <StatusBadge label="Data inventaris" />
        </View>
        <Text style={styles.detailDescription}>{vehicle.description}</Text>
        <View style={styles.specGrid}>
          {[
            ['Transmisi', vehicle.transmission],
            ['Kursi', `${vehicle.seats} orang`],
            ['Bahan bakar', vehicle.fuel_type],
            ['Harga', `Rp ${vehicle.daily_price.toLocaleString('id-ID')}/hari`],
          ].map(([label, value]) => (
            <View key={label} style={styles.specCard}>
              <Text style={styles.specLabel}>{label}</Text>
              <Text style={styles.specValue}>{value}</Text>
            </View>
          ))}
        </View>
        <SectionTitle title="Fitur" />
        <View style={styles.featureList}>
          {features.map((feature) => (
            <View key={feature} style={styles.featureItem}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.bottomAction}>
        <View>
          <Text style={styles.bottomPrice}>Rp {vehicle.daily_price.toLocaleString('id-ID')}</Text>
          <Text style={styles.perDay}>per hari</Text>
        </View>
        <View style={{ width: 150 }}>
          <PrimaryButton label="Tanya booking" onPress={onBook} />
        </View>
      </View>
    </View>
  );
}

export function BookingLookup({
  reference,
  setReference,
  loading,
  booking,
  payments,
  paymentSummary,
  error,
  onLookup,
  onPay,
  paying,
}: {
  reference: string;
  setReference: (value: string) => void;
  loading: boolean;
  booking: Booking | null;
  payments?: Payment[];
  paymentSummary?: PaymentSummary;
  error: string | null;
  onLookup: () => void;
  onPay?: (method: 'QRIS' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'OVO' | 'GOPAY' | 'DANA' | 'CASH') => void;
  paying?: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={styles.lookupContent}>
      <SectionTitle title="Temukan booking Anda" subtitle="Masukkan nomor referensi booking" />
      <View style={styles.lookupSearch}>
        <TextInput
          accessibilityLabel="Referensi booking"
          value={reference}
          onChangeText={setReference}
          placeholder="Contoh: ERB-2026-00001"
          placeholderTextColor={colors.secondaryText}
          autoCapitalize="characters"
          style={styles.lookupInput}
        />
        <Pressable
          accessibilityRole="button"
          disabled={loading || !reference.trim()}
          onPress={onLookup}
          style={[styles.lookupButton, (loading || !reference.trim()) && { opacity: 0.5 }]}
        >
          <Text style={styles.lookupButtonText}>{loading ? '…' : 'Cari'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {booking ? (
        <BookingSummary
          booking={booking}
          payments={payments}
          paymentSummary={paymentSummary}
          onPay={onPay}
          paying={paying}
        />
      ) : (
        <View style={styles.emptyLookup}>
          <Text style={styles.emptyIcon}>⌕</Text>
          <Text style={styles.emptyTitle}>Cari booking tersimpan</Text>
          <Text style={styles.emptyText}>
            Masukkan referensi booking untuk mengambil data dari backend.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export function PaymentModal({
  visible,
  method,
  booking,
  amount,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  method: 'QRIS' | 'OVO' | 'GOPAY' | 'DANA' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CASH' | null;
  booking: Booking | null;
  amount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!visible || !method || !booking) return null;

  const isCash = method === 'CASH';
  const isQr = method === 'QRIS' || method === 'OVO' || method === 'GOPAY' || method === 'DANA';
  const isTransfer = method === 'BANK_TRANSFER';
  const isCard = method === 'CREDIT_CARD';

  // Dynamic QR Code SVG mock via external QR API or styled visual
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=00020101021226${booking.booking_reference}${amount}5802ID5914EASYRENTBALI6007DENPASAR6304`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.paymentModalCard}>
          {/* Header */}
          <View style={styles.paymentModalHeader}>
            <View>
              <Text style={styles.paymentModalTitle}>
                {isCash
                  ? 'Konfirmasi Bayar Tunai'
                  : isQr
                    ? `Pembayaran via ${method}`
                    : isTransfer
                      ? 'Transfer Bank'
                      : 'Pembayaran Kartu Kredit'}
              </Text>
              <Text style={styles.paymentModalSubtitle}>Ref: {booking.booking_reference}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>

          {/* Amount Tag */}
          <View style={styles.modalAmountBox}>
            <Text style={styles.modalAmountLabel}>Total yang harus dibayar:</Text>
            <Text style={styles.modalAmountValue}>Rp {amount.toLocaleString('id-ID')}</Text>
          </View>

          {/* QR Code section for QRIS / OVO / GOPAY / DANA */}
          {isQr && (
            <View style={styles.qrSection}>
              <Text style={styles.qrInstruction}>
                Scan QR Code berikut menggunakan aplikasi {method === 'QRIS' ? 'M-Banking / E-Wallet' : method}:
              </Text>
              <View style={styles.qrFrame}>
                <Image
                  source={{ uri: qrUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.qrTimer}>QR Code berlaku untuk booking ini</Text>
            </View>
          )}

          {/* Cash on delivery confirmation */}
          {isCash && (
            <View style={styles.cashSection}>
              <Text style={styles.cashIcon}>💵</Text>
              <Text style={styles.cashTitle}>Bayar Tunai Saat Penjemputan</Text>
              <Text style={styles.cashInstruction}>
                Anda akan membayar tunai sejumlah Rp {amount.toLocaleString('id-ID')} kepada petugas saat pengambilan kendaraan di {booking.pickup_location}.
              </Text>
              <View style={styles.cashNoticeBox}>
                <Text style={styles.cashNoticeText}>
                  ℹ️ Dengan menekan tombol konfirmasi di bawah, status booking Anda akan langsung aktif (CONFIRMED) dan armada disiapkan untuk Anda.
                </Text>
              </View>
            </View>
          )}

          {/* Bank Transfer info */}
          {isTransfer && (
            <View style={styles.transferSection}>
              <Text style={styles.transferBankName}>BCA (Bank Central Asia)</Text>
              <Text style={styles.transferAccountNumber}>7820 8920 1192</Text>
              <Text style={styles.transferAccountHolder}>a.n. PT EASY RENT BALI</Text>
              <Text style={styles.transferNote}>
                Silakan transfer tepat Rp {amount.toLocaleString('id-ID')} lalu tekan tombol konfirmasi di bawah.
              </Text>
            </View>
          )}

          {/* Credit card simulated secure gateway */}
          {isCard && (
            <View style={styles.transferSection}>
              <Text style={styles.transferBankName}>Pembayaran Kartu Kredit / Debit</Text>
              <Text style={styles.transferNote}>
                Sistem simulasi gateway kartu siap memproses tagihan Rp {amount.toLocaleString('id-ID')}.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.modalActionRow}>
            <Pressable
              disabled={busy}
              onPress={onClose}
              style={[styles.modalSecondaryButton, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.modalSecondaryText}>Batal</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              style={[styles.modalPrimaryButton, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.modalPrimaryText}>
                {busy
                  ? 'Memproses...'
                  : isCash
                    ? 'Konfirmasi Bayar Tunai'
                    : 'Konfirmasi Sudah Bayar'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsScreen({
  backend,
  llm,
  mcp,
  currentUser,
  onClearConversation,
  onLogout,
}: {
  backend: HealthStatus['status'];
  llm: HealthStatus['status'];
  mcp: HealthStatus['status'];
  currentUser?: User | null;
  onClearConversation: () => void;
  onLogout?: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <View style={styles.profileCard}>
        <View style={styles.profileMark}>
          <Text style={styles.profileMarkText}>
            {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'ER'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileTitle}>{currentUser?.name ?? 'Easy Rent Bali'}</Text>
          <Text style={styles.profileSubtitle}>
            {currentUser ? `@${currentUser.username} (${currentUser.role})` : 'AI Assistant'}
          </Text>
        </View>
      </View>
      <SectionTitle title="Koneksi" subtitle="Status layanan aktual" />
      <View style={styles.settingsCard}>
        {[
          ['Backend', backend],
          ['OpenRouter', llm],
          ['MCP Inventory & Booking', mcp],
        ].map(([label, value]) => (
          <View key={label} style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label}</Text>
            <StatusBadge
              label={value === 'connected' ? 'Terhubung' : 'Tidak terhubung'}
              tone={value === 'connected' ? 'success' : 'warning'}
            />
          </View>
        ))}
      </View>
      <SectionTitle title="Preferensi & Akun" />
      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Bahasa</Text>
          <Text style={styles.settingValue}>Indonesia</Text>
        </View>
        <Pressable onPress={onClearConversation} style={styles.settingRow}>
          <Text style={styles.settingLabel}>Hapus riwayat percakapan</Text>
          <Text style={styles.settingArrow}>›</Text>
        </Pressable>
        {onLogout && (
          <Pressable onPress={onLogout} style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.settingLabel, { color: colors.error, fontWeight: '700' }]}>
              Keluar (Logout)
            </Text>
            <Text style={[styles.settingArrow, { color: colors.error }]}>›</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

export function LoginScreen({
  onLoginSuccess,
}: {
  onLoginSuccess: (user: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (userVal?: string, passVal?: string) => {
    const u = userVal ?? username;
    const p = passVal ?? password;
    if (!u.trim() || !p.trim()) {
      setError('Masukkan username dan password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(u.trim(), p.trim());
      if (res.user) {
        onLoginSuccess(res.user);
      } else {
        setError('Login gagal. Periksa username dan password.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungi server.');
    } finally {
      setBusy(false);
    }
  };

  const fillQuick = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.loginContent}>
      <View style={styles.loginHeader}>
        <View style={styles.loginLogo}>
          <Text style={styles.loginLogoText}>ER</Text>
        </View>
        <Text style={styles.loginTitle}>Easy Rent Bali</Text>
        <Text style={styles.loginSubtitle}>Silakan masuk ke akun Anda</Text>
      </View>

      <View style={styles.loginCard}>
        <Text style={styles.loginLabel}>Username</Text>
        <TextInput
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            setError(null);
          }}
          placeholder="user / admin"
          placeholderTextColor={colors.secondaryText}
          autoCapitalize="none"
          style={styles.loginInput}
        />

        <Text style={styles.loginLabel}>Password</Text>
        <TextInput
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          placeholder="user123 / admin123"
          placeholderTextColor={colors.secondaryText}
          secureTextEntry
          autoCapitalize="none"
          style={styles.loginInput}
        />

        {error && (
          <View style={styles.loginErrorBox}>
            <Text style={styles.loginErrorText}>⚠️ {error}</Text>
          </View>
        )}

        <Pressable
          disabled={busy}
          onPress={() => handleLogin()}
          style={({ pressed }) => [
            styles.loginButton,
            pressed && { opacity: 0.8 },
            busy && { backgroundColor: colors.secondaryText },
          ]}
        >
          <Text style={styles.loginButtonText}>
            {busy ? 'Memeriksa kredensial...' : 'Masuk'}
          </Text>
        </Pressable>

        <View style={styles.quickLoginDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Login Cepat (Demo)</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.quickLoginRow}>
          <Pressable
            style={styles.quickButton}
            onPress={() => fillQuick('user', 'user123')}
          >
            <Text style={styles.quickButtonRole}>Customer</Text>
            <Text style={styles.quickButtonCreds}>user / user123</Text>
          </Pressable>

          <Pressable
            style={[styles.quickButton, styles.quickButtonAdmin]}
            onPress={() => fillQuick('admin', 'admin123')}
          >
            <Text style={[styles.quickButtonRole, { color: colors.teal }]}>Admin</Text>
            <Text style={styles.quickButtonCreds}>admin / admin123</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function AdminDashboardScreen({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'fleet'>('overview');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchOverview = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.getAdminOverview();
      setData(res);
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gagal memuat data admin');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchOverview();
  }, []);

  const handleToggleVehicle = async (vehicleId: string, currentStatus: 'AVAILABLE' | 'UNAVAILABLE') => {
    const nextStatus = currentStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    setActionBusy(`v-${vehicleId}`);
    try {
      await api.updateAdminVehicle(vehicleId, nextStatus);
      await fetchOverview(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal mengubah status armada');
    } finally {
      setActionBusy(null);
    }
  };

  const handleUpdateBooking = async (bookingRef: string, nextStatus: 'CONFIRMED' | 'CANCELLED') => {
    setActionBusy(`b-${bookingRef}`);
    try {
      await api.updateAdminBooking(bookingRef, nextStatus);
      await fetchOverview(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status booking');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.adminContent}>
      {/* Top Header Bar */}
      <View style={styles.adminHeader}>
        <View>
          <Text style={styles.adminHeaderBadge}>DASHBOARD ADMIN</Text>
          <Text style={styles.adminHeaderTitle}>Selamat Datang, {user.name}</Text>
          <Text style={styles.adminHeaderSubtitle}>Easy Rent Bali Operations</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.adminLogoutBtn}>
          <Text style={styles.adminLogoutText}>Keluar</Text>
        </Pressable>
      </View>

      {/* Segment Navigation */}
      <View style={styles.adminTabs}>
        <Pressable
          style={[styles.adminTabBtn, activeTab === 'overview' && styles.adminTabBtnActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.adminTabLabel, activeTab === 'overview' && styles.adminTabLabelActive]}>
            Ringkasan
          </Text>
        </Pressable>
        <Pressable
          style={[styles.adminTabBtn, activeTab === 'bookings' && styles.adminTabBtnActive]}
          onPress={() => setActiveTab('bookings')}
        >
          <Text style={[styles.adminTabLabel, activeTab === 'bookings' && styles.adminTabLabelActive]}>
            Bookings ({data?.bookings.length ?? 0})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.adminTabBtn, activeTab === 'fleet' && styles.adminTabBtnActive]}
          onPress={() => setActiveTab('fleet')}
        >
          <Text style={[styles.adminTabLabel, activeTab === 'fleet' && styles.adminTabLabelActive]}>
            Armada ({data?.vehicles.length ?? 0})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.adminLoading}>
          <Text style={styles.adminLoadingText}>Memuat data dashboard admin...</Text>
        </View>
      ) : statusMsg ? (
        <View style={styles.adminErrorBox}>
          <Text style={styles.adminErrorText}>⚠️ {statusMsg}</Text>
          <Pressable onPress={() => fetchOverview()} style={styles.adminRetryBtn}>
            <Text style={styles.adminRetryText}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && data && (
            <View>
              {/* Stat Cards */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>Rp {(data.stats.totalRevenue / 1000).toLocaleString('id-ID')}k</Text>
                  <Text style={styles.statLabel}>Total Pendapatan</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: colors.teal }]}>{data.stats.confirmedBookings}</Text>
                  <Text style={styles.statLabel}>Booking Sukses</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: '#E58A1F' }]}>{data.stats.pendingBookings}</Text>
                  <Text style={styles.statLabel}>Menunggu Bayar</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: colors.navy }]}>
                    {data.stats.availableVehicles}/{data.stats.totalVehicles}
                  </Text>
                  <Text style={styles.statLabel}>Armada Tersedia</Text>
                </View>
              </View>

              {/* Recent Bookings Snapshot */}
              <SectionTitle title="Booking Terbaru" subtitle="5 pesanan rental paling mutakhir" />
              {data.bookings.slice(0, 5).map((b) => (
                <View key={b.booking_reference} style={styles.recentItem}>
                  <View style={styles.recentHeader}>
                    <Text style={styles.recentRef}>{b.booking_reference}</Text>
                    <StatusBadge
                      label={b.booking_status}
                      tone={
                        b.booking_status === 'CONFIRMED'
                          ? 'success'
                          : b.booking_status === 'PENDING'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </View>
                  <Text style={styles.recentName}>👤 {b.customer_name} ({b.customer_phone})</Text>
                  <Text style={styles.recentDates}>
                    📅 {b.start_date} s/d {b.end_date} • 🚘 {b.vehicle_id}
                  </Text>
                  <Text style={styles.recentPrice}>
                    Total: Rp {b.total_estimated_price.toLocaleString('id-ID')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* TAB 2: BOOKINGS LIST */}
          {activeTab === 'bookings' && data && (
            <View>
              <SectionTitle title="Semua Booking" subtitle="Kelola status dan verifikasi manual" />
              {data.bookings.length === 0 ? (
                <Text style={styles.emptyNotice}>Belum ada booking yang tercatat.</Text>
              ) : (
                data.bookings.map((b) => (
                  <View key={b.booking_reference} style={styles.adminBookingCard}>
                    <View style={styles.adminBookingHeader}>
                      <View>
                        <Text style={styles.adminBookingRef}>{b.booking_reference}</Text>
                        <Text style={styles.adminBookingCustomer}>{b.customer_name} • {b.customer_phone}</Text>
                      </View>
                      <StatusBadge
                        label={b.booking_status}
                        tone={
                          b.booking_status === 'CONFIRMED'
                            ? 'success'
                            : b.booking_status === 'PENDING'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    </View>

                    <View style={styles.adminBookingDetails}>
                      <Text style={styles.adminDetailText}>🚘 Armada: <Text style={{ fontWeight: '700' }}>{b.vehicle_id}</Text></Text>
                      <Text style={styles.adminDetailText}>📅 Jadwal: {b.start_date} – {b.end_date}</Text>
                      <Text style={styles.adminDetailText}>📍 Lokasi: {b.pickup_location} → {b.return_location}</Text>
                      <Text style={styles.adminDetailText}>
                        💰 Total: Rp {b.total_estimated_price.toLocaleString('id-ID')} 
                        {b.paid_total !== undefined && ` (Dibayar: Rp ${b.paid_total.toLocaleString('id-ID')})`}
                      </Text>
                    </View>

                    {/* Admin Actions */}
                    <View style={styles.adminBookingActions}>
                      {b.booking_status !== 'CONFIRMED' && (
                        <Pressable
                          disabled={actionBusy === `b-${b.booking_reference}`}
                          style={[styles.adminActionBtn, { backgroundColor: colors.teal }]}
                          onPress={() => handleUpdateBooking(b.booking_reference, 'CONFIRMED')}
                        >
                          <Text style={styles.adminActionBtnText}>
                            {actionBusy === `b-${b.booking_reference}` ? '...' : '✓ Setujui (CONFIRMED)'}
                          </Text>
                        </Pressable>
                      )}
                      {b.booking_status !== 'CANCELLED' && (
                        <Pressable
                          disabled={actionBusy === `b-${b.booking_reference}`}
                          style={[styles.adminActionBtn, { backgroundColor: '#C0392B' }]}
                          onPress={() => handleUpdateBooking(b.booking_reference, 'CANCELLED')}
                        >
                          <Text style={styles.adminActionBtnText}>
                            {actionBusy === `b-${b.booking_reference}` ? '...' : '✕ Batalkan'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: FLEET LIST */}
          {activeTab === 'fleet' && data && (
            <View>
              <SectionTitle title="Manajemen Armada" subtitle="Atur ketersediaan unit sewa" />
              {data.vehicles.map((v) => (
                <View key={v.id} style={styles.adminFleetCard}>
                  {v.image_url ? (
                    <Image source={{ uri: v.image_url }} style={styles.adminFleetImage} resizeMode="cover" />
                  ) : null}
                  <View style={styles.adminFleetBody}>
                    <View style={styles.adminFleetHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.adminFleetTitle}>{v.brand} {v.model} ({v.year})</Text>
                        <Text style={styles.adminFleetSub}>{v.vehicle_type} • {v.transmission} • {v.seats} seats</Text>
                        <Text style={styles.adminFleetPrice}>Rp {v.daily_price.toLocaleString('id-ID')} / hari</Text>
                      </View>
                      <StatusBadge
                        label={v.availability_status}
                        tone={v.availability_status === 'AVAILABLE' ? 'success' : 'warning'}
                      />
                    </View>

                    <Pressable
                      disabled={actionBusy === `v-${v.id}`}
                      style={[
                        styles.fleetToggleBtn,
                        v.availability_status === 'AVAILABLE'
                          ? styles.fleetToggleBtnOff
                          : styles.fleetToggleBtnOn,
                      ]}
                      onPress={() => handleToggleVehicle(v.id, v.availability_status)}
                    >
                      <Text style={styles.fleetToggleBtnText}>
                        {actionBusy === `v-${v.id}`
                          ? 'Memperbarui...'
                          : v.availability_status === 'AVAILABLE'
                            ? 'Ubah ke UNAVAILABLE (Bengkel/Sewa)'
                            : 'Aktifkan Kembali (AVAILABLE)'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  splash: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashMarkText: { color: colors.navy, fontSize: 24, fontWeight: '900' },
  splashTitle: { color: colors.surface, fontSize: 24, fontWeight: '800', marginTop: spacing.lg },
  splashSubtitle: { color: '#C9D5DF', fontSize: 14, marginTop: 6 },
  chatRoot: { flex: 1, backgroundColor: colors.background },
  chatScroll: { flex: 1 },
  chatContent: { padding: spacing.lg, paddingBottom: spacing.md },
  welcome: { backgroundColor: colors.softNavy, borderRadius: radius.lg, padding: spacing.xl },
  welcomeTitle: { color: colors.navy, fontSize: 21, lineHeight: 28, fontWeight: '800' },
  welcomeSubtitle: {
    color: colors.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  promptTitle: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  promptChip: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  promptText: { color: colors.navy, fontSize: 12, fontWeight: '700' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAssistant: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  assistantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  assistantAvatarText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  userBubble: { backgroundColor: colors.teal, borderBottomRightRadius: 4 },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  speechButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingTop: spacing.xs,
    paddingRight: spacing.sm,
  },
  speechButtonText: { color: colors.teal, fontSize: 12, fontWeight: '700' },
  speechError: { color: colors.error, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  vehicleResult: { marginTop: spacing.md, marginLeft: 42, maxWidth: 370 },
  bookingSummary: {
    marginTop: spacing.md,
    marginLeft: 42,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bookingSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingRef: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  bookingName: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.md },
  bookingMeta: { color: colors.secondaryText, fontSize: 12, marginTop: 4 },
  bookingPrice: { color: colors.teal, fontSize: 15, fontWeight: '800', marginTop: spacing.md },
  connectionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  chatInputWrap: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingLeft: spacing.lg,
    paddingRight: 8,
    paddingVertical: 8,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    color: colors.text,
    fontSize: 15,
    paddingTop: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.border },
  sendIcon: { color: colors.surface, fontSize: 22, lineHeight: 24 },
  screenContent: { padding: spacing.lg, paddingBottom: 120 },
  detailVisual: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.softNavy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  detailCarBody: {
    width: 260,
    height: 82,
    borderRadius: 40,
    backgroundColor: '#AEBBC8',
    marginTop: 18,
  },
  detailWindow: {
    position: 'absolute',
    width: 108,
    height: 38,
    borderRadius: 20,
    backgroundColor: '#DDE7ED',
    left: 76,
    top: -24,
  },
  detailWheelLeft: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.navy,
    left: 38,
    bottom: -14,
  },
  detailWheelRight: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.navy,
    right: 38,
    bottom: -14,
  },
  imagePlaceholder: { color: colors.secondaryText, fontSize: 11, marginTop: 30 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.xl },
  detailTitle: { color: colors.navy, fontSize: 24, fontWeight: '800' },
  detailYear: { color: colors.secondaryText, marginTop: 4 },
  detailDescription: {
    color: colors.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.lg,
  },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.xl },
  specCard: {
    width: '48%',
    minHeight: 78,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  specLabel: { color: colors.secondaryText, fontSize: 11 },
  specValue: { color: colors.navy, fontSize: 14, fontWeight: '800', marginTop: spacing.sm },
  featureList: { marginTop: spacing.md, gap: spacing.sm },
  featureItem: { flexDirection: 'row', alignItems: 'center' },
  featureCheck: { width: 24, color: colors.teal, fontSize: 16, fontWeight: '900' },
  featureText: { color: colors.text, fontSize: 14 },
  bottomAction: {
    height: 82,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  bottomPrice: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  perDay: { color: colors.secondaryText, fontSize: 11 },
  lookupContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  lookupSearch: { flexDirection: 'row', marginTop: spacing.lg },
  lookupInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  lookupButton: {
    width: 72,
    height: 48,
    marginLeft: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupButtonText: { color: colors.surface, fontWeight: '800' },
  errorText: { color: colors.error, fontSize: 13, marginTop: spacing.md },
  emptyLookup: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.softNavy,
    color: colors.secondaryText,
    fontSize: 28,
    textAlign: 'center',
    lineHeight: 56,
  },
  emptyTitle: { color: colors.navy, fontSize: 16, fontWeight: '800', marginTop: spacing.lg },
  emptyText: {
    color: colors.secondaryText,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
    marginTop: spacing.sm,
  },
  settingsContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  paymentBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paymentBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.navy,
    marginBottom: 2,
  },
  paymentBoxSubtitle: {
    fontSize: 11,
    color: colors.secondaryText,
    marginBottom: spacing.sm,
  },
  paymentMethodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  paymentMethodButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.softNavy,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethodText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  paidConfirmationBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#E6F9F0',
    borderWidth: 1,
    borderColor: '#A3E8C4',
  },
  paidConfirmationText: {
    color: '#0D6832',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 20, 40, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  paymentModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  paymentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paymentModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
  },
  paymentModalSubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.softNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  modalAmountBox: {
    backgroundColor: colors.softNavy,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalAmountLabel: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  modalAmountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.teal,
  },
  qrSection: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  qrInstruction: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  qrFrame: {
    padding: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrTimer: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: spacing.sm,
  },
  cashSection: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  cashIcon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  cashTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  cashInstruction: {
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  cashNoticeBox: {
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cashNoticeText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  transferSection: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.softNavy,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  transferBankName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
  },
  transferAccountNumber: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.teal,
    marginVertical: spacing.xs,
  },
  transferAccountHolder: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  transferNote: {
    fontSize: 11,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  modalSecondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  modalSecondaryText: {
    color: colors.secondaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  modalPrimaryButton: {
    flex: 2,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 13,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  profileMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileMarkText: { color: colors.navy, fontWeight: '900' },
  profileTitle: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  profileSubtitle: { color: '#C8D3DE', fontSize: 12, marginTop: 3 },
  settingsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  settingValue: { color: colors.secondaryText, fontSize: 13 },
  settingArrow: { color: colors.secondaryText, fontSize: 24 },
  loginContent: {
    padding: spacing.xl,
    paddingTop: spacing.xxl * 2,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  loginLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loginLogoText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.navy,
  },
  loginSubtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 4,
  },
  loginCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  loginInput: {
    backgroundColor: colors.softNavy,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginErrorBox: {
    backgroundColor: '#FDECEA',
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  loginErrorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: colors.navy,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  loginButtonText: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
  quickLoginDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    paddingHorizontal: spacing.md,
    color: colors.secondaryText,
    fontSize: 12,
  },
  quickLoginRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.softNavy,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonAdmin: {
    borderColor: colors.teal,
    backgroundColor: '#E0F2F1',
  },
  quickButtonRole: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.navy,
  },
  quickButtonCreds: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
  },
  adminContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  adminHeaderBadge: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  adminHeaderTitle: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  adminHeaderSubtitle: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  adminLogoutBtn: {
    backgroundColor: '#C0392B',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  adminLogoutText: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 12,
  },
  adminTabs: {
    flexDirection: 'row',
    backgroundColor: colors.softNavy,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  adminTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  adminTabBtnActive: {
    backgroundColor: colors.surface,
  },
  adminTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  adminTabLabelActive: {
    color: colors.navy,
    fontWeight: '800',
  },
  adminLoading: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  adminLoadingText: {
    color: colors.secondaryText,
    fontSize: 13,
  },
  adminErrorBox: {
    backgroundColor: '#FDECEA',
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  adminErrorText: {
    color: colors.error,
    fontWeight: '600',
    fontSize: 13,
  },
  adminRetryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  adminRetryText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.navy,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 4,
  },
  recentItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recentRef: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.navy,
  },
  recentName: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  recentDates: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  recentPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.teal,
    marginTop: 4,
  },
  emptyNotice: {
    color: colors.secondaryText,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  adminBookingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  adminBookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  adminBookingRef: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
  },
  adminBookingCustomer: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  adminBookingDetails: {
    gap: 4,
    marginBottom: spacing.md,
  },
  adminDetailText: {
    fontSize: 12,
    color: colors.text,
  },
  adminBookingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  adminActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminActionBtnText: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 12,
  },
  adminFleetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  adminFleetImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.softNavy,
  },
  adminFleetBody: {
    padding: spacing.md,
  },
  adminFleetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  adminFleetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.navy,
  },
  adminFleetSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  adminFleetPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.teal,
    marginTop: 4,
  },
  fleetToggleBtn: {
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  fleetToggleBtnOff: {
    backgroundColor: '#FDECEA',
    borderWidth: 1,
    borderColor: colors.error,
  },
  fleetToggleBtnOn: {
    backgroundColor: '#E0F2F1',
    borderWidth: 1,
    borderColor: colors.teal,
  },
  fleetToggleBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
});
