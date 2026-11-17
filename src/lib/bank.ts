import { get, set, del } from "idb-keyval";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ImportedBankMovement } from "@/lib/bank-statement";

export type BankDirection = "incoming" | "outgoing";
export interface BankMovement {
  id: string;
  owner_id: string;
  account_id: string;
  direction: BankDirection;
  amount: number;
  date: string;
  counterparty: string;
  description: string;
  type?: string;
  reference?: string;
  status?: string;
  balance_after?: number;
  counterparty_iban?: string;
  transaction_reason?: string;
  bank_name?: string;
  raw_source_snippet?: string;
  source?: string | null;
  created_at: string;
}
export type BankMovementInput = Pick<BankMovement, "direction" | "amount" | "date" | "counterparty" | "description">;
export interface BankAccountOption {
  id: string;
  bank_name: string;
  account_name: string;
  currency: string;
  account_kind?: "personal" | "business";
}
export interface BankDocument {
  id: string;
  file_name: string;
  mime_type: string;
  file_data: string;
  imported_at: string;
  movement_count: number;
}
type BankVault = { accounts: BankAccountOption[]; transactions: BankMovement[]; documents?: BankDocument[] };
type EncryptedVault = { version: 1; salt: string; iv: string; ciphertext: string };
type EncryptedBiometricPassphrase = { credentialId: string; prfSalt: string; iv: string; ciphertext: string };

const PBKDF2_ITERATIONS = 600_000;
const vaultKey = (ownerId: string) => `saha-bank-vault-v1:${ownerId}`;
const biometricVaultKey = (ownerId: string) => `saha-bank-vault-biometric-v1:${ownerId}`;
const keyCache = new Map<string, CryptoKey>();
const utf8 = new TextEncoder();
const decoder = new TextDecoder();
const vaultAad = (ownerId: string) => utf8.encode(`saha-bank-vault-v1:${ownerId}`);
const bytesToBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const bytesToBuffer = (value: Uint8Array) => Uint8Array.from(value).buffer;
type PrfOutput = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | Uint8Array } } };
const extensionOutput = (credential: PublicKeyCredential) => credential.getClientExtensionResults() as unknown as PrfOutput;

async function biometricWrapKey(prfOutput: ArrayBuffer | Uint8Array) {
  const raw = prfOutput instanceof Uint8Array ? bytesToBuffer(prfOutput) : prfOutput;
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function requirePrfOutput(credential: PublicKeyCredential) {
  const output = extensionOutput(credential).prf?.results?.first;
  if (!output) throw new Error("Bu tarayıcı veya cihaz güvenli biyometrik kasa açma (WebAuthn PRF) özelliğini desteklemiyor. Kasa parolasıyla devam edebilirsin.");
  return output;
}

async function openBiometricCredential(ownerId: string, saved: EncryptedBiometricPassphrase) {
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) throw new Error("Biyometrik kilit için HTTPS ve desteklenen bir cihaz gerekir.");
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: location.hostname,
    allowCredentials: [{ type: "public-key", id: base64ToBytes(saved.credentialId) }],
    userVerification: "required",
    timeout: 60_000,
    extensions: { prf: { eval: { first: base64ToBytes(saved.prfSalt) } } },
  } as unknown as PublicKeyCredentialRequestOptions }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Biyometrik doğrulama tamamlanmadı.");
  const key = await biometricWrapKey(await requirePrfOutput(credential));
  const aad = utf8.encode(`${ownerId}:${saved.credentialId}:saha-bank-vault`);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(saved.iv), additionalData: aad }, key, base64ToBytes(saved.ciphertext));
  return decoder.decode(clear);
}

async function enableBiometricVault(ownerId: string, passphrase: string) {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) throw new Error("Biyometrik kilit için HTTPS ve desteklenen bir cihaz gerekir.");
  const encrypted = await get<EncryptedVault>(vaultKey(ownerId));
  if (!encrypted) throw new Error("Bu cihazda şifreli kasa bulunamadı.");
  await decryptVault(ownerId, passphrase, encrypted);
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Saha Kasa", id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(32)), name: `saha-${ownerId}`, displayName: "Saha kişisel kasa" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
    attestation: "none",
    extensions: { prf: { eval: { first: prfSalt } } },
    timeout: 60_000,
  } as unknown as PublicKeyCredentialCreationOptions }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Biyometrik kayıt tamamlanmadı.");
  const key = await biometricWrapKey(await requirePrfOutput(credential));
  const credentialId = bytesToBase64(new Uint8Array(credential.rawId));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = utf8.encode(`${ownerId}:${credentialId}:saha-bank-vault`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, utf8.encode(passphrase));
  await set(biometricVaultKey(ownerId), { credentialId, prfSalt: bytesToBase64(prfSalt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) } satisfies EncryptedBiometricPassphrase);
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", utf8.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: Uint8Array.from(salt).buffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptVault(ownerId: string, passphrase: string, vault: BankVault) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: vaultAad(ownerId) }, key, utf8.encode(JSON.stringify(vault)));
  keyCache.set(ownerId, key);
  return { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) } satisfies EncryptedVault;
}

async function decryptVault(ownerId: string, passphrase: string, encrypted: EncryptedVault): Promise<BankVault> {
  if (encrypted.version !== 1) throw new Error("Kasa biçimi desteklenmiyor.");
  const key = await deriveKey(passphrase, base64ToBytes(encrypted.salt));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(encrypted.iv), additionalData: vaultAad(ownerId) }, key, base64ToBytes(encrypted.ciphertext));
  const parsed = JSON.parse(decoder.decode(plaintext)) as BankVault;
  if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) throw new Error("Kasa verisi doğrulanamadı.");
  keyCache.set(ownerId, key);
  return parsed;
}

async function readVault(ownerId: string): Promise<BankVault> {
  const encrypted = await get<EncryptedVault>(vaultKey(ownerId));
  const key = keyCache.get(ownerId);
  if (!encrypted || !key) throw new Error("Kişisel kasanın kilidini aç.");
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(encrypted.iv), additionalData: vaultAad(ownerId) }, key, base64ToBytes(encrypted.ciphertext));
    const parsed = JSON.parse(decoder.decode(plaintext)) as BankVault;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) throw new Error("Kasa verisi doğrulanamadı.");
    return { ...parsed, documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch {
    keyCache.delete(ownerId);
    throw new Error("Kasa kilitlendi. Parolanla yeniden aç.");
  }
}

async function writeVault(ownerId: string, vault: BankVault) {
  const key = keyCache.get(ownerId);
  if (!key) throw new Error("Kişisel kasanın kilidini aç.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: vaultAad(ownerId) }, key, utf8.encode(JSON.stringify(vault)));
  const previous = await get<EncryptedVault>(vaultKey(ownerId));
  if (!previous) throw new Error("Şifreli kasa bulunamadı.");
  await set(vaultKey(ownerId), { ...previous, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
}

/** Resolve the signed-in identity without requesting financial data from the server. */
export function useBankOwnerId() {
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setOwnerId(data.user?.id ?? null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextOwnerId = session?.user.id ?? null;
      if (ownerId && ownerId !== nextOwnerId) keyCache.delete(ownerId);
      setOwnerId(nextOwnerId);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [ownerId]);
  return ownerId;
}

export function useBankVault(ownerId: string | null | undefined) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setExists(null);
    setUnlocked(false);
    if (ownerId) void get<EncryptedVault>(vaultKey(ownerId)).then((saved) => { if (active) setExists(Boolean(saved)); });
    else setExists(false);
    return () => { active = false; if (ownerId) keyCache.delete(ownerId); };
  }, [ownerId]);

  useEffect(() => {
    let active = true;
    if (ownerId) void get<EncryptedBiometricPassphrase>(biometricVaultKey(ownerId)).then((saved) => { if (active) setBiometricReady(Boolean(saved)); });
    else setBiometricReady(false);
    return () => { active = false; };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !unlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const lockNow = () => {
      clearTimeout(timer);
      keyCache.delete(ownerId);
      setUnlocked(false);
    };
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(lockNow, 5 * 60 * 1000);
    };
    const handleVisibility = () => document.visibilityState === "hidden" ? lockNow() : resetTimer();
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    resetTimer();
    return () => {
      clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ownerId, unlocked]);

  async function create(passphrase: string) {
    if (!ownerId) throw new Error("Oturum gerekli.");
    if (passphrase.length < 14) throw new Error("Kasa parolası en az 14 karakter olmalı.");
    setBusy(true);
    try {
      const encrypted = await encryptVault(ownerId, passphrase, { accounts: [{ id: crypto.randomUUID(), bank_name: "Elle kayıt", account_name: "Kişisel hesap", currency: "TRY" }], transactions: [] });
      await set(vaultKey(ownerId), encrypted);
      setExists(true);
      setUnlocked(true);
    } finally { setBusy(false); }
  }

  async function unlock(passphrase: string) {
    if (!ownerId) throw new Error("Oturum gerekli.");
    const saved = await get<EncryptedVault>(vaultKey(ownerId));
    if (!saved) throw new Error("Bu cihazda kasa bulunamadı.");
    setBusy(true);
    try { await decryptVault(ownerId, passphrase, saved); setUnlocked(true); }
    catch { keyCache.delete(ownerId); throw new Error("Parola yanlış veya kasa verisi açılamadı."); }
    finally { setBusy(false); }
  }

  async function unlockBiometric() {
    if (!ownerId) throw new Error("Oturum gerekli.");
    const saved = await get<EncryptedBiometricPassphrase>(biometricVaultKey(ownerId));
    if (!saved) throw new Error("Bu cihazda kasa biyometrisi ayarlanmamış.");
    setBusy(true);
    try {
      const passphrase = await openBiometricCredential(ownerId, saved);
      const encrypted = await get<EncryptedVault>(vaultKey(ownerId));
      if (!encrypted) throw new Error("Şifreli kasa bulunamadı.");
      await decryptVault(ownerId, passphrase, encrypted);
      setUnlocked(true);
    } finally { setBusy(false); }
  }

  async function enableBiometric(passphrase: string) {
    if (!ownerId || !unlocked) throw new Error("Önce kasayı parolanla aç.");
    setBusy(true);
    try { await enableBiometricVault(ownerId, passphrase); setBiometricReady(true); }
    finally { setBusy(false); }
  }

  async function disableBiometric() {
    if (ownerId) await del(biometricVaultKey(ownerId));
    setBiometricReady(false);
  }

  function lock() {
    if (ownerId) keyCache.delete(ownerId);
    setUnlocked(false);
  }

  async function erase() {
    if (ownerId) keyCache.delete(ownerId);
    if (ownerId) await del(vaultKey(ownerId));
    setExists(false);
    setUnlocked(false);
  }
  return { exists, unlocked, busy, biometricReady, create, unlock, unlockBiometric, enableBiometric, disableBiometric, lock, erase };
}

/** One-time user-triggered migration: encrypt legacy cloud rows locally, verify write, then delete plaintext cloud rows. */
export async function migrateLegacyBankData(ownerId: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Lütfen yeniden giriş yap.");
  const { data: cloudAccounts, error: accountError } = await supabase.from("bank_accounts").select("*").eq("owner_id", ownerId);
  if (accountError) throw new Error("Eski hesap kayıtları okunamadı; bulut kayıtları değiştirilmedi.");
  const { data: cloudRows, error: movementError } = await supabase.from("bank_transactions").select("*").eq("owner_id", ownerId);
  if (movementError) throw new Error("Eski hareketler okunamadı; bulut kayıtları değiştirilmedi.");
  const vault = await readVault(ownerId);
  const accountIds = new Map<string, string>();
  for (const account of cloudAccounts ?? []) {
    const localAccountId = crypto.randomUUID();
    accountIds.set(account.id, localAccountId);
    vault.accounts.push({ id: localAccountId, bank_name: account.bank_name || "Banka", account_name: account.account_name || "Kişisel hesap", currency: account.currency || "TRY", account_kind: account.account_kind === "business" ? "business" : "personal" });
  }
  for (const row of cloudRows ?? []) {
    const localAccountId = accountIds.get(row.account_id);
    if (!localAccountId) throw new Error("Bir hareketin hesabı eşleşmedi; bulut kayıtları değiştirilmedi.");
    vault.transactions.push({
      id: crypto.randomUUID(), owner_id: ownerId, account_id: localAccountId,
      direction: row.direction === "in" || row.direction === "incoming" ? "incoming" : "outgoing",
      amount: Number(row.amount), date: row.date, counterparty: row.counterparty || "", description: row.description || "",
        ...(row.type ? { type: row.type } : {}),
        ...(row.reference ? { reference: row.reference } : {}),
        ...(row.status ? { status: row.status } : {}),
        ...(Number(row.balance_after) ? { balance_after: Number(row.balance_after) } : {}),
        source: row.source, created_at: row.created_at,
    });
  }
  await writeVault(ownerId, vault);
  const verified = await readVault(ownerId);
  if (verified.transactions.length < (cloudRows?.length ?? 0)) throw new Error("Şifreli kopya doğrulanamadı; bulut kayıtları silinmedi.");
  const { error: deleteTransactionsError } = await supabase.from("bank_transactions").delete().eq("owner_id", ownerId);
  if (deleteTransactionsError) throw new Error("Şifreli kopya oluşturuldu ancak buluttaki eski hareketler silinemedi. Kişisel kasada kopya var; bulut kayıtlarını ayrıca temizlemek gerekiyor.");
  const { error: deleteAccountsError } = await supabase.from("bank_accounts").delete().eq("owner_id", ownerId);
  if (deleteAccountsError) throw new Error("Hareketler buluttan silindi, ancak eski hesap kaydı silinemedi. Hesap kaydını Supabase tablosundan ayrıca temizlemek gerekiyor.");
  return { accountCount: cloudAccounts?.length ?? 0, movementCount: cloudRows?.length ?? 0 };
}

/** Delete previously archived plaintext PDFs after the user explicitly requests cloud cleanup. */
export async function deleteLegacyBankDocuments(ownerId: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Lütfen yeniden giriş yap.");
  const { data: documents, error } = await supabase.from("bank_documents").select("id, object_path").eq("owner_id", ownerId);
  if (error) throw new Error("Buluttaki banka PDF listesi alınamadı.");
  const paths = (documents ?? []).map((doc) => doc.object_path);
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error: storageError } = await supabase.storage.from("bank-private").remove(paths.slice(offset, offset + 100));
    if (storageError) throw new Error("Bazı PDF dosyaları bulut depolamadan silinemedi.");
  }
  const { error: rowsError } = await supabase.from("bank_documents").delete().eq("owner_id", ownerId);
  if (rowsError) throw new Error("PDF dosyaları silindi ancak belge kayıtları temizlenemedi.");
  return paths.length;
}

export function useBankAccounts(ownerId: string | null | undefined, unlocked: boolean) {
  return useQuery({
    queryKey: ["bank-accounts", ownerId, unlocked], enabled: Boolean(ownerId && unlocked), staleTime: 0,
    queryFn: async () => (ownerId ? (await readVault(ownerId)).accounts : []) as BankAccountOption[],
  });
}

export function useBankMovements(ownerId: string | null | undefined, accountId: string | null | undefined, unlocked: boolean) {
  return useQuery({
    queryKey: ["bank-movements", ownerId, accountId, unlocked], enabled: Boolean(ownerId && accountId && unlocked), staleTime: 0,
    queryFn: async () => {
      if (!ownerId || !accountId) return [];
      const vault = await readVault(ownerId);
      return vault.transactions.filter((row) => row.account_id === accountId).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    },
  });
}

export function useBankDocuments(ownerId: string | null | undefined, unlocked: boolean) {
  return useQuery({
    queryKey: ["bank-documents", ownerId, unlocked], enabled: Boolean(ownerId && unlocked), staleTime: 0,
    queryFn: async () => ownerId ? (await readVault(ownerId)).documents ?? [] : [],
  });
}

/** Save the original statement and its parsed movements together in the encrypted local vault. */
export async function importBankStatementFile(ownerId: string, accountId: string, file: File, parsedRows: ImportedBankMovement[]) {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || auth.user?.id !== ownerId) throw new Error("Oturum değişti. Yeniden giriş yap.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Ekstre dosyası en fazla 8 MB olabilir.");
  if (parsedRows.length === 0) throw new Error("Dosyada aktarılabilir hareket yok.");
  const vault = await readVault(ownerId);
  vault.documents ??= [];
  const account = vault.accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("Aktarım hesabı bulunamadı.");
  const documentId = crypto.randomUUID();
  const binary = new Uint8Array(await file.arrayBuffer());
  let binaryString = "";
  for (let offset = 0; offset < binary.length; offset += 0x8000) binaryString += String.fromCharCode(...binary.subarray(offset, offset + 0x8000));
  const fileData = btoa(binaryString);
  const existing = new Set(vault.transactions.map((row) => {
    const key = row.reference?.trim().toLocaleLowerCase("tr-TR");
    return key ? `${row.account_id}|ref|${key}` : `${row.account_id}|${row.date}|${row.direction}|${row.amount.toFixed(2)}|${row.counterparty.trim().toLocaleLowerCase("tr-TR")}|${row.description.trim().toLocaleLowerCase("tr-TR")}`;
  }));
  const now = new Date().toISOString();
  let importedCount = 0;
  for (const row of parsedRows) {
    const ref = row.reference?.trim().toLocaleLowerCase("tr-TR");
    const key = ref ? `${account.id}|ref|${ref}` : `${account.id}|${row.date}|${row.direction}|${row.amount.toFixed(2)}|${row.counterparty.trim().toLocaleLowerCase("tr-TR")}|${row.description.trim().toLocaleLowerCase("tr-TR")}`;
    if (existing.has(key)) continue;
    existing.add(key);
    vault.transactions.unshift({
      id: crypto.randomUUID(), owner_id: ownerId, account_id: account.id,
      direction: row.direction, amount: row.amount, date: row.date,
      counterparty: row.counterparty, description: row.description,
      ...(row.reference ? { reference: row.reference } : {}),
      ...(row.balance_after !== undefined ? { balance_after: row.balance_after } : {}),
      ...(row.counterparty_iban ? { counterparty_iban: row.counterparty_iban } : {}),
      ...(row.transaction_reason ? { transaction_reason: row.transaction_reason } : {}),
      bank_name: row.bank_name || account.bank_name,
      ...(row.raw_source_snippet ? { raw_source_snippet: row.raw_source_snippet } : {}),
      status: "completed", source: "email_attachment", created_at: now,
    });
    importedCount++;
  }
  vault.documents.unshift({ id: documentId, file_name: file.name.slice(0, 180), mime_type: file.type || "application/octet-stream", file_data: fileData, imported_at: now, movement_count: importedCount });
  await writeVault(ownerId, vault);
  return { importedCount, duplicateCount: parsedRows.length - importedCount, documentId };
}

export async function getBankDocumentFile(ownerId: string, documentId: string) {
  const document = (await readVault(ownerId)).documents?.find((item) => item.id === documentId);
  if (!document) throw new Error("Ekstre dosyası bulunamadı.");
  const binary = atob(document.file_data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new File([bytes], document.file_name, { type: document.mime_type });
}

export function useAddBankMovement(ownerId: string | null | undefined, accountId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BankMovementInput) => {
      if (!ownerId) throw new Error("Oturum gerekli");
      const vault = await readVault(ownerId);
      const account = accountId ? vault.accounts.find((candidate) => candidate.id === accountId) : vault.accounts[0];
      if (!account) throw new Error("Önce kişisel hesap kasasını oluşturup kilidini aç.");
      vault.transactions.unshift({ id: crypto.randomUUID(), owner_id: ownerId, account_id: account.id, direction: input.direction, amount: input.amount, date: input.date, counterparty: input.counterparty, description: input.description, type: "diger", status: "completed", source: "manual", created_at: new Date().toISOString() });
      await writeVault(ownerId, vault);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bank-movements", ownerId] }); toast.success("Hareket bu cihazdaki şifreli kasaya kaydedildi"); },
    onError: (error: Error) => toast.error(error.message || "Hareket kaydedilemedi"),
  });
}

export function useDeleteBankMovement(ownerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!ownerId) throw new Error("Oturum gerekli");
      const vault = await readVault(ownerId);
      const next = vault.transactions.filter((row) => row.id !== id);
      if (next.length === vault.transactions.length) throw new Error("Hareket bulunamadı.");
      vault.transactions = next;
      await writeVault(ownerId, vault);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bank-movements", ownerId] }); toast.success("Hareket şifreli kasadan silindi"); },
    onError: (error: Error) => toast.error(error.message || "Hareket silinemedi"),
  });
}
