# Kantor Agent

Dashboard realtime untuk memantau aktivitas agent AI kampanye. Data diambil langsung dari Supabase (tabel `agents`, `events`, `approvals`) dan ditampilkan sebagai panggung isometrik 5 ruangan kerja ditambah ruang Meeting H+1 + Mission Log + panel persetujuan.

## Tujuan
Visualisasikan status kerja agent (ATHENA, ARGUS, METIS, dsb.) dan alur event mereka secara realtime tanpa perlu refresh halaman, serta memberi manusia tempat untuk menyetujui/menolak langkah yang perlu persetujuan (human-in-the-loop lewat n8n).

## Login

Dashboard ini butuh akun Supabase Auth untuk masuk (email + kata sandi). Belum ada form daftar sendiri di app. Buat user lewat salah satu cara ini:

**Lewat Dashboard Supabase** (paling mudah):
1. Buka project di [supabase.com](https://supabase.com/dashboard) → **Authentication** → **Users** → **Add user**.
2. Isi email dan password, lalu set "Auto Confirm User" supaya bisa langsung login.

**Lewat SQL / API admin** juga memungkinkan, tapi menu Dashboard di atas sudah cukup untuk kebutuhan tim kecil.

Hanya email yang terdaftar di `APPROVER_EMAILS` yang bisa menyetujui/menolak approval lewat panel "Menunggu Persetujuan" — user Supabase Auth lain tetap bisa login dan melihat dashboard, tapi tombol Setujui/Tolak akan ditolak server (403) kalau emailnya tidak ada di daftar itu.

## Menjalankan Secara Lokal

```bash
# 1. Install dependensi
npm install

# 2. Salin file env contoh dan isi nilainya
cp .env.local.example .env.local
# Edit .env.local, isi:
# NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # dari Project Settings > API
# APPROVER_EMAILS=email1@contoh.com,email2@contoh.com

# 3. Jalankan dev server
npm run dev
```

Buka http://localhost:3000, lalu login dengan user yang dibuat di langkah "Login" di atas.

## Variabel Lingkungan
| Variabel | Deskripsi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase (format `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key Supabase (aman untuk client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase. **Hanya dipakai di server** (route `/api/approvals/[id]`), tidak pernah diimpor ke komponen client. Jangan pakai prefix `NEXT_PUBLIC_`. |
| `APPROVER_EMAILS` | Daftar email yang boleh menyetujui/menolak approval, dipisah koma. Hanya dibaca di server. |

> **Catatan keamanan:** `SUPABASE_SERVICE_ROLE_KEY` dan `APPROVER_EMAILS` tidak boleh pernah muncul di bundle browser. Setelah `npm run build`, kamu bisa cek sendiri dengan:
> ```bash
> grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static
> ```
> Perintah ini seharusnya tidak menemukan apa pun.

## Skema Tabel Supabase

### `agents`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `nama` | text (PK) | Nama agent, mis. `ATHENA`, `METIS` |
| `ruangan` | text | Ruangan: `Riset`, `Copy`, `Landing Page`, `Advertiser`, `Creative` |
| `peran` | text | Deskripsi peran singkat |
| `status` | text | `idle` \| `working` \| `review` |

### `events`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | bigint (PK, auto) | ID event |
| `waktu` | timestamptz | Waktu kejadian (server time) |
| `agent` | text | Nama agent (FK ke `agents.nama`) |
| `status` | text | `working` \| `done` \| `review` |
| `pesan` | text | Deskripsi event / temuan |

### `approvals`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | bigint (PK, auto) | ID approval |
| `event_id` | bigint | FK ke `events.id` |
| `agent` | text | Nama agent (FK ke `agents.nama`) |
| `ringkasan` | text, nullable | Ringkasan singkat yang perlu disetujui |
| `status` | text | `pending` \| `disetujui` \| `ditolak` \| `kedaluwarsa` |
| `catatan` | text, nullable | Catatan opsional dari approver |
| `dibuat` | timestamptz | Waktu approval dibuat |
| `diputuskan` | timestamptz, nullable | Waktu keputusan diambil |
| `diputuskan_oleh` | text, nullable | Email approver |

### `approval_secrets`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `approval_id` | bigint (PK, FK ke `approvals.id`) | |
| `resume_url` | text | URL resume webhook n8n. **Tidak punya RLS policy** — hanya `service_role` yang bisa membacanya, dan tidak pernah dikirim ke browser. |

Realtime: aplikasi berlangganan `INSERT` pada `events`, `UPDATE` pada `agents`, dan semua perubahan pada `approvals` via Supabase Realtime. Jika koneksi putus, polling cadangan tiap 5 detik akan aktif otomatis.

## Alur Persetujuan

1. n8n menulis baris baru ke `approvals` (status `pending`) dan `resume_url` ke `approval_secrets`.
2. Panel "Menunggu Persetujuan" di dashboard menampilkannya secara realtime.
3. Approver (email ada di `APPROVER_EMAILS`) klik **Setujui**/**Tolak**, opsional isi catatan.
4. Browser POST ke `/api/approvals/[id]` dengan `{ keputusan, catatan }` — **tanpa** `resume_url`.
5. Server (route handler) verifikasi session (`getUser()`), cek email ada di `APPROVER_EMAILS`, lalu pakai `SUPABASE_SERVICE_ROLE_KEY` untuk membaca `resume_url` dan memastikan approval masih `pending`.
6. Server POST `{ keputusan, catatan }` ke `resume_url` tersebut. Kalau n8n menolak atau execution-nya sudah kedaluwarsa, status approval diubah jadi `kedaluwarsa` dan error dikembalikan ke browser.
7. Kalau sukses, kolom `status`, `diputuskan`, `diputuskan_oleh` di `approvals` diperbarui.

## Deploy ke Vercel
1. Push repo ke GitHub
2. Import project di Vercel
3. Set empat Environment Variable di atas (Production, Preview, Development)
4. Deploy

## Teknologi
- Next.js 16 (App Router, Turbopack, Proxy pengganti Middleware)
- React 19
- `@supabase/ssr` (session berbasis cookie) + Supabase JS Client (Realtime + PostgREST)
- TypeScript, ESLint