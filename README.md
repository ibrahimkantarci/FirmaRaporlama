# Qlik -> Vercel -> Google Sheets

Seçilen `customer_id` için Qlik'teki tek tablodan, bu yıl + geçen yıl tüm sütunları
çekip yan yana (YoY) bir Google Sheet'e yazan uygulama.

## Mimari
    Tarayıcı -> /api/qlik/export?id=... (sunucu) -> Qlik Engine (seçim+okuma) -> Google Sheets

API key ve Google kimlik bilgileri yalnızca sunucu tarafında (env) tutulur.

## Uç noktalar
- `GET /api/qlik`                      -> tablo verisi (önizleme; ?limit=all)
- `GET /api/qlik/fields`               -> alan adları
- `GET /api/qlik/fields?name=<alan>`   -> bir alanın değerleri
- `GET /api/qlik/select-test?field=&value=` -> izole seçim testi (kalan satır)
- `GET /api/qlik/customer?id=<id>`     -> 7 kolon, bu yıl/geçen yıl (özet)
- `GET /api/qlik/export?id=<id>`       -> tüm sütunlar YoY, Google Sheet'e yazar

## Kurulum
1. `npm install`
2. `cp .env.local.example .env.local` ve doldur (aşağıdaki Google adımları dahil)
3. `npm run dev`

## Google Sheets kurulumu (bir kerelik)
1. Google Cloud Console'da bir proje seç/oluştur.
2. "Google Sheets API"yi etkinleştir.
3. IAM -> Service Accounts -> yeni Service Account oluştur.
4. O Service Account için "Keys" -> "Add key" -> JSON indir.
5. JSON'dan `client_email` ve `private_key` değerlerini `.env.local`'a koy
   (private_key'i tek satır, "\n" kaçışlı, çift tırnak içinde).
6. Hedef Google Sheet'i aç -> "Paylaş" -> Service Account e-postasını
   **Editör** olarak ekle. (Bu adım atlanırsa "permission" hatası alırsın.)
7. Sheet ID'sini (URL'deki /d/<ID>/edit) `GOOGLE_SHEET_ID`'ye yaz.

## Vercel'e deploy
Repo'yu Vercel'e bağla, tüm env değişkenlerini (Qlik 4 + Google 4) Vercel
proje ayarlarındaki Environment Variables'a ekle. `.env.local` deploy edilmez.

## Aşamalar
- [x] 1. İskelet
- [x] 2. Qlik bağlantı testi
- [x] 3. Tablo okuma
- [x] 4. Filtre/selection (customer_id + load_date)
- [x] 5. YoY tam döküm -> Google Sheets
- [ ] 6. Frontend (customer_id giriş + "Aktar" butonu) + Vercel deploy
- [ ] 7. Sunum template'i
