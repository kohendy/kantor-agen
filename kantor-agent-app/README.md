# Kantor Agent

Dashboard realtime untuk memantau aktivitas agent AI kampanye. Data diambil langsung dari Supabase (tabel `agents` dan `events`) dan ditampilkan sebagai panggung isometrik 4 ruangan + Mission Log.

## Tujuan
Visualisasikan status kerja agent (ATHENA, ARGUS, METIS, dsb.) dan alur event mereka secara realtime tanpa perlu refresh halaman.

## Menjalankan Secara Lokal

```bash
# 1. Install dependensi
npm install

# 2. Salin file env contoh dan isi nilainya
cp .env.local.example .env.local
# Edit .env.local, isi:
# NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# 3. Jalankan dev server
npm run dev
```

Buka http://localhost:3000

## Variabel Lingkungan
| Variabel | Deskripsi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase (format `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key Supabase (aman untuk client-side) |

> **Catatan:** Hanya anon key yang dipakai. Jangan pernah memasukkan service role key ke web app.

## Skema Tabel Supabase

### `agents`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `nama` | text (PK) | Nama agent, mis. `ATHENA`, `METIS` |
| `ruangan` | text | Ruangan: `Riset`, `Copy`, `Kreatif`, `Ops` |
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

Realtime: aplikasi berlangganan `INSERT` pada `events` dan `UPDATE` pada `agents` via Supabase Realtime. Jika koneksi putus, polling cadangan tiap 5 detik akan aktif otomatis.

## Deploy ke Vercel
1. Push repo ke GitHub
2. Import project di Vercel
3. Set dua Environment Variable di atas (Production, Preview, Development)
4. Deploy

## Teknologi
- Next.js 16 (App Router, Turbopack)
- React 19
- Supabase JS Client (Realtime + PostgREST)
- TypeScript, ESLint