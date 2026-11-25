import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { colors } from './constants/theme';
import { AppHeader, BottomNavigation, MainTab } from './components/Navigation';
import { ConfirmationDialog } from './components/UI';
import { Booking, ChatResponse, HealthStatus, Payment, PaymentSummary, User, api, Vehicle } from './services/api';
import {
  AdminDashboardScreen,
  BookingLookup,
  ChatMessage,
  ChatScreen,
  LoginScreen,
  PaymentModal,
  SettingsScreen,
  SplashScreen,
  VehicleDetails,
} from './screens';

type Screen = 'chat' | 'lookup' | 'settings' | 'details';
type PersistedConversation = {
  conversationId: string;
  messages: ChatMessage[];
};

const STORAGE_KEY = 'easy-rent-bali-conversation-v1';
const AUTH_STORAGE_KEY = 'easy-rent-bali-auth-user';

function createConversationId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba kembali.';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen] = useState<Screen>('chat');
  const [conversationId, setConversationId] = useState(createConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ChatResponse['pendingConfirmation']>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [speechErrorId, setSpeechErrorId] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [lookupReference, setLookupReference] = useState('');
  const [lookupBooking, setLookupBooking] = useState<Booking | null>(null);
  const [lookupPayments, setLookupPayments] = useState<Payment[]>([]);
  const [lookupPaymentSummary, setLookupPaymentSummary] = useState<PaymentSummary | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    'QRIS' | 'OVO' | 'GOPAY' | 'DANA' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CASH' | null
  >(null);
  const [health, setHealth] = useState<{
    backend: HealthStatus;
    llm: HealthStatus;
    mcp: HealthStatus;
  }>({
    backend: { status: 'unknown' },
    llm: { status: 'unknown' },
    mcp: { status: 'unknown' },
  });
  const sendingRef = useRef(false);
  const speechPlayer = useAudioPlayer(null);
  const speechPlayerStatus = useAudioPlayerStatus(speechPlayer);
  const speechBusyRef = useRef(false);
  const speechRequestIdRef = useRef(0);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechCache = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => setShowSplash(false), 900);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!active || !value) return;
        const saved = JSON.parse(value) as PersistedConversation;
        if (saved.conversationId && Array.isArray(saved.messages)) {
          setConversationId(saved.conversationId);
          setMessages(saved.messages);
        }
      })
      .catch(() => {
        if (active) {
          setMessages([
            {
              id: 'storage-warning',
              role: 'assistant',
              text: 'Riwayat lokal belum dapat dipulihkan. Anda tetap dapat memulai percakapan baru.',
              speakable: false,
            },
          ]);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((val) => {
        if (!active || !val) return;
        const savedUser = JSON.parse(val) as User;
        if (savedUser && savedUser.username) {
          setCurrentUser(savedUser);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ conversationId, messages } satisfies PersistedConversation),
    ).catch(() => {
      // Storage failure does not block a live conversation.
    });
  }, [conversationId, hydrated, messages]);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch {
      setHealth({
        backend: { status: 'disconnected' },
        llm: { status: 'disconnected' },
        mcp: { status: 'disconnected' },
      });
    }
  }, []);

  const stopSpeech = useCallback(() => {
    speechRequestIdRef.current += 1;
    speechBusyRef.current = false;
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    speechPlayer.pause();
    if (Platform.OS === 'web') {
      for (const uri of speechCache.current.values()) URL.revokeObjectURL(uri);
    }
    speechCache.current.clear();
    setSpeechLoadingId(null);
    setActiveSpeechId(null);
    setSpeechErrorId(null);
    setSpeechError(null);
  }, [speechPlayer]);

  const speakMessage = useCallback(
    async (messageId: string, text: string) => {
      if (!text.trim() || speechBusyRef.current) return;
      const alreadyPlaying =
        activeSpeechId === messageId &&
        (Platform.OS === 'web'
          ? speechAudioRef.current !== null && !speechAudioRef.current.paused
          : speechPlayerStatus.playing);
      if (alreadyPlaying) {
        speechAudioRef.current?.pause();
        speechPlayer.pause();
        setActiveSpeechId(null);
        return;
      }

      const requestId = ++speechRequestIdRef.current;
      speechBusyRef.current = true;
      setSpeechLoadingId(messageId);
      setSpeechErrorId(null);
      setSpeechError(null);
      try {
        let uri = speechCache.current.get(messageId);
        if (!uri) {
          const audio = await api.synthesizeSpeech(text);
          if (requestId !== speechRequestIdRef.current) return;
          if (Platform.OS === 'web') {
            const audioBuffer = new ArrayBuffer(audio.byteLength);
            new Uint8Array(audioBuffer).set(audio);
            uri = URL.createObjectURL(new Blob([audioBuffer], { type: 'audio/mpeg' }));
          } else {
            const file = new File(
              Paths.cache,
              `easy-rent-speech-${Date.now()}-${speechCache.current.size}.mp3`,
            );
            await file.write(audio);
            uri = file.uri;
          }
          speechCache.current.set(messageId, uri);
        }
        if (requestId !== speechRequestIdRef.current) return;

        if (Platform.OS === 'web') {
          speechAudioRef.current?.pause();
          const audioPlayer = new globalThis.Audio(uri);
          audioPlayer.onended = () => {
            if (speechAudioRef.current === audioPlayer) {
              speechAudioRef.current = null;
              setActiveSpeechId(null);
            }
          };
          audioPlayer.onerror = () => {
            if (speechAudioRef.current === audioPlayer) {
              speechAudioRef.current = null;
              setActiveSpeechId(null);
              setSpeechErrorId(messageId);
              setSpeechError('Audio tidak dapat diputar pada perangkat ini.');
            }
          };
          speechAudioRef.current = audioPlayer;
          await audioPlayer.play();
        } else {
          speechPlayer.replace({ uri });
          speechPlayer.play();
        }
        setActiveSpeechId(messageId);
      } catch (error) {
        if (requestId === speechRequestIdRef.current) {
          setSpeechErrorId(messageId);
          setSpeechError(describeError(error));
        }
      } finally {
        if (requestId === speechRequestIdRef.current) {
          speechBusyRef.current = false;
          setSpeechLoadingId(null);
        }
      }
    },
    [activeSpeechId, speechPlayer, speechPlayerStatus.playing],
  );

  useEffect(
    () => () => {
      speechAudioRef.current?.pause();
      if (Platform.OS === 'web') {
        for (const uri of speechCache.current.values()) URL.revokeObjectURL(uri);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshHealth();
    const interval = setInterval(() => void refreshHealth(), 30000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const addAssistantResponse = useCallback((response: ChatResponse) => {
    const text = response.message?.trim();
    if (!text) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-empty`,
          role: 'assistant',
          text: 'Saya belum menerima jawaban. Silakan coba kembali.',
          speakable: false,
        },
      ]);
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text,
        vehicles: response.vehicles?.length ? response.vehicles : undefined,
        booking: response.booking,
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (rawMessage = input) => {
      const message = rawMessage.trim();
      if (!message || sendingRef.current || !hydrated) return;
      sendingRef.current = true;
      setSending(true);
      setInput('');
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: message },
      ]);

      try {
        const response = await api.chat(conversationId, message);
        addAssistantResponse(response);
        setPendingConfirmation(response.pendingConfirmation ?? null);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-error`,
            role: 'assistant',
            text: describeError(error),
            speakable: false,
          },
        ]);
      } finally {
        sendingRef.current = false;
        setSending(false);
        void refreshHealth();
      }
    },
    [addAssistantResponse, conversationId, hydrated, input, refreshHealth],
  );

  const handleConfirmation = useCallback(
    async (decision: 'confirm' | 'cancel') => {
      if (!pendingConfirmation || confirmationBusy) return;
      setConfirmationBusy(true);
      try {
        const response = await api.confirmBooking(conversationId, decision);
        setPendingConfirmation(null);
        addAssistantResponse(response);
        if (response.booking) {
          setLookupReference(response.booking.booking_reference);
        }
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-confirmation-error`,
            role: 'assistant',
            text: describeError(error),
            speakable: false,
          },
        ]);
      } finally {
        setConfirmationBusy(false);
        void refreshHealth();
      }
    },
    [addAssistantResponse, confirmationBusy, conversationId, pendingConfirmation, refreshHealth],
  );

  async function startNewConversation() {
    stopSpeech();
    const nextId = createConversationId();
    try {
      await api.resetChat(conversationId);
    } catch {
      setMessages([
        {
          id: `${Date.now()}-reset-warning`,
          role: 'assistant',
          text: 'Tidak dapat menghubungi backend untuk reset. Riwayat lokal tetap dibersihkan.',
          speakable: false,
        },
      ]);
    }
    setConversationId(nextId);
    setMessages([]);
    setPendingConfirmation(null);
    setScreen('chat');
  }

  async function handleLookupBooking() {
    const reference = lookupReference.trim();
    if (!reference || lookupLoading) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupBooking(null);
    setLookupPayments([]);
    setLookupPaymentSummary(undefined);
    try {
      const result = await api.lookupBooking(reference);
      setLookupBooking(result.booking);
      if (result.payments) setLookupPayments(result.payments);
      if (result.paymentSummary) setLookupPaymentSummary(result.paymentSummary);
    } catch (error) {
      setLookupError(describeError(error));
    } finally {
      setLookupLoading(false);
    }
  }

  function handleSelectPaymentMethod(
    method: 'QRIS' | 'OVO' | 'GOPAY' | 'DANA' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CASH',
  ) {
    setSelectedPaymentMethod(method);
  }

  async function handleConfirmPaymentModal() {
    if (!lookupBooking || !selectedPaymentMethod || paymentBusy) return;
    setPaymentBusy(true);
    setLookupError(null);
    try {
      const isCash = selectedPaymentMethod === 'CASH';
      const result = await api.payBooking({
        booking_reference: lookupBooking.booking_reference,
        payment_method: selectedPaymentMethod,
        payment_type: 'FULL',
        notes: isCash
          ? 'Konfirmasi bayar tunai (Cash on Delivery) saat penjemputan armada'
          : `Pembayaran via ${selectedPaymentMethod}`,
      });
      setLookupBooking(result.booking);
      setLookupPayments(result.payments);
      setLookupPaymentSummary(result.paymentSummary);
      setSelectedPaymentMethod(null);
    } catch (error) {
      setLookupError(describeError(error));
    } finally {
      setPaymentBusy(false);
    }
  }

  function changeTab(tab: MainTab) {
    setScreen(tab);
    if (tab === 'settings') void refreshHealth();
  }

  function handleLoginSuccess(user: User) {
    setCurrentUser(user);
    AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)).catch(() => {});
  }

  function handleLogout() {
    setCurrentUser(null);
    AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
  }

  if (showSplash || !hydrated) return <SplashScreen />;

  if (!currentUser) {
    return (
      <View style={styles.app}>
        <StatusBar style="dark" />
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </View>
    );
  }

  if (currentUser.role === 'admin') {
    return (
      <View style={styles.app}>
        <StatusBar style="dark" />
        <AdminDashboardScreen user={currentUser} onLogout={handleLogout} />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />

      {screen === 'chat' && (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <AppHeader
            title="Easy Rent Bali"
            subtitle={
              health.backend.status === 'connected'
                ? 'AI Assistant • Terhubung'
                : 'AI Assistant • Menghubungkan'
            }
            onNew={startNewConversation}
          />
          <ChatScreen
            messages={messages}
            typing={sending}
            sending={sending}
            input={input}
            setInput={setInput}
            onSend={() => void sendMessage()}
            onPrompt={(prompt) => void sendMessage(prompt)}
            onVehicleDetails={(vehicle) => {
              setSelectedVehicle(vehicle);
              setScreen('details');
            }}
            onVehicleBook={(vehicle) => {
              setScreen('chat');
              void sendMessage(
                `Saya ingin booking ${vehicle.brand} ${vehicle.model}. Bantu saya mengisi data booking.`,
              );
            }}
            onSpeak={(messageId, text) => void speakMessage(messageId, text)}
            speechLoadingId={speechLoadingId}
            speechPlayingId={
              Platform.OS === 'web'
                ? speechAudioRef.current && !speechAudioRef.current.paused
                  ? activeSpeechId
                  : null
                : speechPlayerStatus.playing
                  ? activeSpeechId
                  : null
            }
            speechErrorId={speechErrorId}
            speechError={speechError}
            backendStatus={health.backend.status}
            mcpStatus={health.mcp.status}
          />
          <BottomNavigation active="chat" onChange={changeTab} />
          <ConfirmationDialog
            visible={Boolean(pendingConfirmation)}
            title="Konfirmasi aksi booking"
            description={
              pendingConfirmation?.summary ?? 'Tinjau dan konfirmasi aksi booking yang diusulkan.'
            }
            confirmLabel={confirmationBusy ? 'Memproses...' : 'Konfirmasi'}
            onCancel={() => void handleConfirmation('cancel')}
            onConfirm={() => void handleConfirmation('confirm')}
          />
        </KeyboardAvoidingView>
      )}

      {screen === 'lookup' && (
        <View style={styles.flex}>
          <AppHeader title="Cari Booking" />
          <BookingLookup
            reference={lookupReference}
            setReference={setLookupReference}
            loading={lookupLoading}
            booking={lookupBooking}
            payments={lookupPayments}
            paymentSummary={lookupPaymentSummary}
            error={lookupError}
            onLookup={() => void handleLookupBooking()}
            onPay={(method) => handleSelectPaymentMethod(method)}
            paying={paymentBusy}
          />
          <PaymentModal
            visible={Boolean(selectedPaymentMethod && lookupBooking)}
            method={selectedPaymentMethod}
            booking={lookupBooking}
            amount={
              lookupPaymentSummary
                ? lookupPaymentSummary.remainingAmount
                : lookupBooking?.total_estimated_price ?? 0
            }
            busy={paymentBusy}
            onClose={() => setSelectedPaymentMethod(null)}
            onConfirm={() => void handleConfirmPaymentModal()}
          />
          <BottomNavigation active="lookup" onChange={changeTab} />
        </View>
      )}

      {screen === 'settings' && (
        <View style={styles.flex}>
          <AppHeader title="Pengaturan" />
          <SettingsScreen
            backend={health.backend.status}
            llm={health.llm.status}
            mcp={health.mcp.status}
            currentUser={currentUser}
            onClearConversation={() => void startNewConversation()}
            onLogout={handleLogout}
          />
          <BottomNavigation active="settings" onChange={changeTab} />
        </View>
      )}

      {screen === 'details' && selectedVehicle && (
        <VehicleDetails
          vehicle={selectedVehicle}
          onBack={() => setScreen('chat')}
          onBook={() => {
            setScreen('chat');
            void sendMessage(
              `Saya ingin booking ${selectedVehicle.brand} ${selectedVehicle.model}. Bantu saya mengisi data booking.`,
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
});
