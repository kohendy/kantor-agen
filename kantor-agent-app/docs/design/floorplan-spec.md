# Spesifikasi Denah Kantor Agent (disetujui)

Sumber kebenaran untuk Tahap 1 isometrik. Satuan: tile (1 tile = 1 unit dunia).
Format persegi panjang: (x, z, lebar, dalam). Sumbu x ke timur, z ke selatan. Titik (0,0) adalah sudut barat laut Meeting.
Total denah 44 x 36 tile. Pemandangan referensi: kanvas desain "Kantor Agent: Layout Isometrik Penuh", papan 1.

## 1. Ruangan departemen (10)
| id | label | x | z | w | d | warna |
|---|---|---|---|---|---|---|
| meeting | Meeting H+1 | 0 | 0 | 15 | 9 | #b7f34a |
| operasional | Operasional | 17 | 0 | 9 | 9 | #94a3b8 |
| advertiser | Advertiser | 28 | 0 | 13 | 9 | #29c7ff |
| manager | Manager | 0 | 11 | 9 | 9 | #f07167 |
| riset | Riset | 11 | 11 | 10 | 8 | #f5a623 |
| hr | HR | 0 | 21 | 9 | 4 | #e879f9 |
| sosmed | Sosial Media | 0 | 27 | 10 | 7 | #fb923c |
| creative | Creative | 11 | 27 | 10 | 7 | #a78bfa |
| copy | Copy | 22 | 27 | 10 | 7 | #ff4fa3 |
| landing_page | Landing Page | 33 | 27 | 7 | 7 | #2ee6a8 |

## 2. Area umum (8)
| id | label | x | z | w | d |
|---|---|---|---|---|---|
| atrium | Atrium | 21 | 11 | 7 | 10 |
| atrium_selatan | Atrium Selatan | 11 | 21 | 17 | 4 |
| pantry | Pantry | 30 | 11 | 8 | 7 |
| lounge | Lounge | 30 | 19 | 8 | 6 |
| toilet | Toilet | 39 | 11 | 5 | 6 |
| taman | Taman | 39 | 18 | 5 | 7 |
| resepsi | Resepsi | 40 | 27 | 4 | 7 |
| taman_kecil | Taman kecil | 40 | 34 | 4 | 2 |

Relung printer: di dalam atrium (posisi bebas, sebagai prop, bukan ruangan).

## 3. Koridor
| id | x | z | w | d |
|---|---|---|---|---|
| H_N | 0 | 9 | 44 | 2 |
| H_S | 0 | 25 | 44 | 2 |
| V_W | 9 | 9 | 2 | 18 |
| V_E | 28 | 9 | 2 | 18 |
| lorong_1 | 15 | 0 | 2 | 9 |
| lorong_2 | 26 | 0 | 2 | 9 |
| E_lane | 38 | 11 | 1 | 14 |

Catatan: koordinat koridor diturunkan dari kanvas dan perlu dicek terhadap ruangan oleh validasi startup. Jika ada tumpang tindih dengan ruangan, ruangan yang menang dan koridor dipotong; catat selisihnya di laporan.

## 4. Zona ekspansi (bay)
Awalnya terkunci/kosong. Hanya terisi saat ruangan diperluas. Digambar sebagai lantai bergaris.
| id | ruangan | sisi | x | z | w | d |
|---|---|---|---|---|---|---|
| bay_advertiser | advertiser | E | 41 | 0 | 3 | 9 |
| bay_operasional | operasional | N | 17 | -2 | 9 | 2 |
| bay_manager | manager | W | -3 | 11 | 3 | 9 |
| bay_riset | riset | S | 11 | 19 | 10 | 2 |
| bay_hr | hr | W | -3 | 21 | 3 | 4 |
| bay_sosmed | sosmed | S | 0 | 34 | 10 | 2 |
| bay_creative | creative | S | 11 | 34 | 10 | 2 |
| bay_copy | copy | S | 22 | 34 | 10 | 2 |
| bay_landing_page | landing_page | S | 33 | 34 | 7 | 2 |

Bay Advertiser memanjang ke timur menembus x=44; bay Operasional, Manager, dan HR keluar dari kotak 44x36. Batas dunia dan kamera harus memperhitungkan bay (denah efektif sekitar x -3..44, z -2..36). Meeting tidak punya bay.
Bay Riset berada di antara Riset dan Atrium Selatan (z 19-21): ia memakai celah itu.

## 5. Pintu (21)
Lebar pintu 2 tile, kecuali pintu utama (2 tile). Format: titik tengah celah pada garis dinding.
| id | ruangan | sisi dinding | koordinat garis | rentang | tersambung ke |
|---|---|---|---|---|---|
| d_meeting_s | meeting | S | z=9 | x 6-8 | H_N |
| d_meeting_e | meeting | E | x=15 | z 3-5 | lorong_1 |
| d_ops_s | operasional | S | z=9 | x 20-22 | H_N |
| d_ops_w | operasional | W | x=17 | z 3-5 | lorong_1 |
| d_adv_s | advertiser | S | z=9 | x 33-35 | H_N |
| d_adv_w | advertiser | W | x=28 | z 3-5 | lorong_2 |
| d_manager_e | manager | E | x=9 | z 14-16 | V_W |
| d_riset_w | riset | W | x=11 | z 13-15 | V_W |
| d_riset_e | riset | E | x=21 | z 13-15 | atrium |
| d_riset_s | riset | S | z=19 | x 15-17 | bay_riset / atrium_selatan |
| d_hr_e | hr | E | x=9 | z 22-24 | V_W |
| d_sosmed_n | sosmed | N | z=27 | x 4-6 | H_S |
| d_creative_n | creative | N | z=27 | x 15-17 | H_S |
| d_copy_n | copy | N | z=27 | x 26-28 | H_S |
| d_lp_n | landing_page | N | z=27 | x 36-38 | H_S |
| d_pantry_w | pantry | W | x=30 | z 13-15 | V_E |
| d_lounge_w | lounge | W | x=30 | z 21-23 | V_E |
| d_toilet_w | toilet | W | x=39 | z 13-15 | E_lane |
| d_taman_w | taman | W | x=39 | z 20-22 | E_lane |
| d_resepsi_n | resepsi | N | z=27 | x 41-43 | H_S / taman |
| d_main | resepsi | E | x=44 | z 29-31 | luar (pintu masuk utama) |

Catatan: beberapa pintu (misalnya d_riset_s) menuju celah, bukan koridor penuh. Validasi startup harus memastikan setiap pintu menyambung ke area yang bisa dilalui dan melaporkan yang tidak.

## 6. Aturan engine
1. Denah adalah data; render, peta jalan, kursi, dan bay diturunkan darinya.
2. Peta jalan dibuat otomatis: node di tengah koridor, persimpangan, kedua sisi tiap pintu, dan tiap kursi/meja.
3. Setiap meja punya slot yang bisa bertambah. Bay terisi hanya saat ruangan diperluas.
4. Ruangan di tepi bangunan melebar ke luar. Riset melebar ke arah atrium.
5. Dinding sisi kamera (selatan dan timur) dipotong rendah agar interior terlihat.
6. Kamera ortografis isometrik dari tenggara. Pintu utama menghadap kamera. Sudut barat laut (Meeting) menjadi pojok atas pada layar.
7. 19 agent: semua harus punya kursi; Meeting punya 19 kursi di meja panjang.

## 7. Karakter dan agent
Karakter voxel manusia; warna baju mengikuti warna ruangan. Papan 3 kanvas memuat aksesori per departemen. Dikerjakan di tahap terpisah.
