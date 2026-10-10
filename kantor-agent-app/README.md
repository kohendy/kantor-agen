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
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase. **Hanya dipakai di server** (route `/api/approvals/[id]`, `/api/projects/*`), tidak pernah diimpor ke komponen client. Jangan pakai prefix `NEXT_PUBLIC_`. |
| `APPROVER_EMAILS` | Daftar email yang boleh menyetujui/menolak approval dan memulai/menghentikan proyek, dipisah koma. Hanya dibaca di server. |
| `N8N_DISPATCHER_URL` | Webhook URL dari workflow n8n "Orkestrator Dispatcher" (format `https://<n8n-domain>/webhook/<path>`). Server-only, digunakan untuk memicu dispatcher saat proyek dimulai dan saat approval diputuskan. |

> **Catatan keamanan:** `SUPABASE_SERVICE_ROLE_KEY`, `APPROVER_EMAILS`, dan `N8N_DISPATCHER_URL` tidak boleh pernah muncul di bundle browser. Setelah `npm run build`, kamu bisa cek sendiri dengan:
> ```bash
> grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static
> grep -r "N8N_DISPATCHER_URL" .next/static
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
| `event_id` | bigint, nullable | FK ke `events.id` (opsional untuk orkestrasi) |
| `agent` | text | Nama agent (FK ke `agents.nama`) |
| `ringkasan` | text, nullable | Ringkasan singkat yang perlu disetujui |
| `status` | text | `pending` \| `disetujui` \| `ditolak` \| `kedaluwarsa` |
| `catatan` | text, nullable | Catatan opsional dari approver |
| `dibuat` | timestamptz | Waktu approval dibuat |
| `diputuskan` | timestamptz, nullable | Waktu keputusan diambil |
| `diputuskan_oleh` | text, nullable | Email approver |
| `run_id` | bigint, nullable | FK ke `pipeline_runs.id` (untuk alur orkestrasi) |
| `step_id` | bigint, nullable | FK ke `pipeline_steps.id` |
| `gate` | text, nullable | Nama gate peninjauan (mis. `Riset`) |

### `approval_secrets`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `approval_id` | bigint (PK, FK ke `approvals.id`) | |
| `resume_url` | text | URL resume webhook n8n (hanya untuk approval legacy yang tidak memiliki `run_id`). **Tidak punya RLS policy** — hanya `service_role` yang bisa membacanya, dan tidak pernah dikirim ke browser. |

### `pipeline_runs`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | bigint (PK, identity) | ID run proyek |
| `judul` | text | Judul proyek kampanye |
| `brief` | jsonb | Dokumen brief (produk, target audiens, tujuan, budget harian) |
| `fase` | text | Fase saat ini (`riset`, `copy_creative`, `landing_page`, `ads`, `iklan_berjalan`, `selesai`) |
| `status` | text | `jalan` \| `menunggu_persetujuan` \| `butuh_keputusan` \| `selesai` \| `dihentikan` |
| `iterasi` | int | Nomor iterasi siklus kerja |
| `dibuat` | timestamptz | Waktu proyek dibuat |
| `diperbarui` | timestamptz | Waktu terakhir status diperbarui |

### `pipeline_steps`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | bigint (PK, identity) | ID langkah pipeline |
| `run_id` | bigint (FK) | FK ke `pipeline_runs.id` |
| `agen` | text, nullable | Agen yang menangani langkah ini (mis. `METIS`) |
| `fase` | text | Fase dari langkah ini |
| `input` | jsonb, nullable | Input yang diberikan ke langkah/agen |
| `output` | jsonb, nullable | Output atau temuan langkah |
| `status` | text | `menunggu` \| `jalan` \| `selesai` \| `gagal` |
| `revisi_ke` | int | Penghitung revisi (0 = draf awal, 1 = revisi ke-1, 2 = revisi ke-2) |
| `dibuat` | timestamptz | Waktu langkah dibuat |
| `diperbarui` | timestamptz | Waktu langkah diperbarui |

### `pipeline_control`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | int (PK, check id=1) | Baris tunggal kontrol sistem |
| `jalan` | boolean | Sakelar global orkestrasi (default `true`) |

Realtime: aplikasi berlangganan `INSERT` pada `events`, `UPDATE` pada `agents`, serta semua perubahan pada `approvals`, `pipeline_runs`, dan `pipeline_steps` via Supabase Realtime. Jika koneksi putus, polling cadangan akan aktif otomatis.

## Menambahkan `N8N_DISPATCHER_URL` ke Vercel

1. Buka dashboard proyek di Vercel: `https://vercel.com/<tim>/<project>/settings/environment-variables`
2. Tambahkan variabel baru:
   - **Key**: `N8N_DISPATCHER_URL`
   - **Value**: Masukkan webhook URL production workflow "Orkestrator Dispatcher" dari n8n instance kamu (tanpa tanda kutip).
   - **Environments**: Centang `Production`, `Preview`, dan `Development`.
3. Klik **Save** lalu lakukan deploy ulang proyek.

## Deploy ke Vercel
1. Push repo ke GitHub (buat Pull Request)
2. Import project di Vercel
3. Set seluruh Environment Variable di atas (Production, Preview, Development)
4. Deploy

## Teknologi
- Next.js 16 (App Router, Turbopack, Proxy pengganti Middleware)
- React 19
- `@supabase/ssr` (session berbasis cookie) + Supabase JS Client (Realtime + PostgREST)
- TypeScript, ESLint