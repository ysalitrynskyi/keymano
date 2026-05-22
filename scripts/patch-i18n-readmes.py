#!/usr/bin/env python3
"""Patch docs/i18n/README.*.md with Getting Started, Save/Save As, Privacy sections."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / "docs" / "i18n"

PATCHES: dict[str, tuple[str, str, str, str]] = {
    "de": (
        "> 🟢 **Neu bei GitHub oder kein Entwickler?** Lies den verständlichen **[Einstiegsleitfaden (Englisch)](../../docs/GETTING_STARTED.md)**.\n\n",
        "- **Speichern vs. Speichern unter** — Speichern überschreibt die aktuelle Datei; Speichern unter legt eine Kopie an.\n",
        "## Datenschutz\n\nDie **Desktop-App** sammelt nichts und läuft offline. Die **gehostete Web-App** unter [keymano.ys.contact](https://keymano.ys.contact) nutzt optional **Google Analytics** (anonyme Seitenaufrufe). Deine `.keylayout`-Arbeit verlässt den Browser nie. Selbst gehostete Instanzen haben keine Analytics, außer der Betreiber aktiviert sie. Siehe [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Einstieg (Englisch, einfach): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "fr": (
        "> 🟢 **Nouveau sur GitHub ou pas développeur ?** Lisez le **[guide de démarrage (anglais)](../../docs/GETTING_STARTED.md)** en langage simple.\n\n",
        "- **Enregistrer vs. Enregistrer sous** — Enregistrer écrase le fichier actuel ; Enregistrer sous crée une copie.\n",
        "## Confidentialité\n\nL’**application de bureau** ne collecte rien et fonctionne hors ligne. L’**application web hébergée** sur [keymano.ys.contact](https://keymano.ys.contact) utilise optionnellement **Google Analytics** (statistiques de pages anonymes). Votre travail `.keylayout` ne quitte jamais le navigateur. Une instance auto-hébergée n’a pas d’analytique sauf si l’opérateur l’active. Voir [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Démarrage (anglais, simple) : [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "es": (
        "> 🟢 **¿Nuevo en GitHub o no eres desarrollador?** Lee la **[guía de inicio (inglés)](../../docs/GETTING_STARTED.md)** en lenguaje sencillo.\n\n",
        "- **Guardar vs. Guardar como** — Guardar sobrescribe el archivo actual; Guardar como crea una copia.\n",
        "## Privacidad\n\nLa **app de escritorio** no recopila nada y funciona sin conexión. La **app web alojada** en [keymano.ys.contact](https://keymano.ys.contact) usa opcionalmente **Google Analytics** (estadísticas anónimas de páginas). Tu trabajo `.keylayout` nunca sale del navegador. Las instancias autoalojadas no tienen analítica salvo que el operador la active. Ver [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Inicio (inglés, sencillo): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "it": (
        "> 🟢 **Nuovo su GitHub o non sei uno sviluppatore?** Leggi la **[guida introduttiva (inglese)](../../docs/GETTING_STARTED.md)** in linguaggio semplice.\n\n",
        "- **Salva vs. Salva con nome** — Salva sovrascrive il file corrente; Salva con nome crea una copia.\n",
        "## Privacy\n\nL’**app desktop** non raccoglie dati e funziona offline. L’**app web ospitata** su [keymano.ys.contact](https://keymano.ys.contact) usa opzionalmente **Google Analytics** (statistiche anonime delle pagine). Il tuo lavoro `.keylayout` non lascia mai il browser. Le istanze self-hosted non hanno analitiche salvo attivazione. Vedi [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Guida iniziale (inglese, semplice): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "pt": (
        "> 🟢 **Novo no GitHub ou não é desenvolvedor?** Leia o **[guia de início (inglês)](../../docs/GETTING_STARTED.md)** em linguagem simples.\n\n",
        "- **Salvar vs. Salvar como** — Salvar substitui o arquivo atual; Salvar como cria uma cópia.\n",
        "## Privacidade\n\nO **app desktop** não coleta nada e funciona offline. O **app web hospedado** em [keymano.ys.contact](https://keymano.ys.contact) usa opcionalmente **Google Analytics** (estatísticas anônimas de páginas). Seu trabalho `.keylayout` nunca sai do navegador. Instâncias self-hosted não têm analytics, salvo se o operador ativar. Veja [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Início (inglês, simples): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "nl": (
        "> 🟢 **Nieuw op GitHub of geen ontwikkelaar?** Lees de eenvoudige **[startgids (Engels)](../../docs/GETTING_STARTED.md)**.\n\n",
        "- **Opslaan vs. Opslaan als** — Opslaan overschrijft het huidige bestand; Opslaan als maakt een kopie.\n",
        "## Privacy\n\nDe **desktop-app** verzamelt niets en werkt offline. De **gehoste web-app** op [keymano.ys.contact](https://keymano.ys.contact) gebruikt optioneel **Google Analytics** (anonieme paginaweergaven). Je `.keylayout`-werk verlaat de browser nooit. Self-hosted instanties hebben geen analytics tenzij de beheerder dit inschakelt. Zie [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Startgids (Engels, eenvoudig): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "pl": (
        "> 🟢 **Nowy na GitHubie lub nie jesteś programistą?** Przeczytaj prostą **[instrukcję startową (po angielsku)](../../docs/GETTING_STARTED.md)**.\n\n",
        "- **Zapisz vs. Zapisz jako** — Zapisz nadpisuje bieżący plik; Zapisz jako tworzy kopię.\n",
        "## Prywatność\n\n**Aplikacja desktopowa** nic nie zbiera i działa offline. **Hostowana wersja web** na [keymano.ys.contact](https://keymano.ys.contact) opcjonalnie używa **Google Analytics** (anonimowe statystyki stron). Twoja praca `.keylayout` nigdy nie opuszcza przeglądarki. Instancje self-hosted nie mają analityki, chyba że operator ją włączy. Zobacz [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Start (angielski, prosty): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "uk": (
        "> 🟢 **Новачок на GitHub або не розробник?** Прочитайте простий **[посібник для початку (англійською)](../../docs/GETTING_STARTED.md)**.\n\n",
        "- **Зберегти vs. Зберегти як** — Зберегти перезаписує поточний файл; Зберегти як створює копію.\n",
        "## Конфіденційність\n\n**Десктопний застосунок** нічого не збирає і працює офлайн. **Хостована веб-версія** на [keymano.ys.contact](https://keymano.ys.contact) за бажанням використовує **Google Analytics** (анонімна статистика переглядів). Ваша робота з `.keylayout` ніколи не залишає браузер. Самохостинг без аналітики, доки оператор її не увімкне. Див. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Початок (англійською, просто): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ru": (
        "> 🟢 **Новичок на GitHub или не разработчик?** Прочитайте простое **[руководство для начала (на английском)](../../docs/GETTING_STARTED.md)**.\n\n",
        "- **Сохранить vs. Сохранить как** — Сохранить перезаписывает текущий файл; Сохранить как создаёт копию.\n",
        "## Конфиденциальность\n\n**Настольное приложение** ничего не собирает и работает офлайн. **Размещённая веб-версия** на [keymano.ys.contact](https://keymano.ys.contact) по желанию использует **Google Analytics** (анонимная статистика просмотров). Ваша работа с `.keylayout` никогда не покидает браузер. Самостоятельный хостинг без аналитики, пока оператор её не включит. См. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Начало (англ., просто): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ja": (
        "> 🟢 **GitHub が初めて、または開発者ではない方へ** — 平易な英語の **[はじめにガイド](../../docs/GETTING_STARTED.md)** をお読みください。\n\n",
        "- **保存 vs. 別名で保存** — 保存は現在のファイルを上書き、別名で保存はコピーを作成します。\n",
        "## プライバシー\n\n**デスクトップアプリ**は何も収集せずオフラインで動作します。**ホストされた Web アプリ** [keymano.ys.contact](https://keymano.ys.contact) は任意で **Google Analytics**（匿名のページ閲覧統計）を使用します。`.keylayout` の作業はブラウザから出ません。自己ホストでは運用者が有効にしない限り分析はありません。[PRIVACY.md](../../PRIVACY.md) を参照。\n\n",
        "- 📘 はじめに（英語・平易）: [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "zh-Hans": (
        "> 🟢 **不熟悉 GitHub 或不是开发者？** 请阅读通俗英文 **[入门指南](../../docs/GETTING_STARTED.md)**。\n\n",
        "- **保存 vs. 另存为** — 保存覆盖当前文件；另存为创建副本。\n",
        "## 隐私\n\n**桌面应用**不收集任何数据，可完全离线使用。**托管 Web 应用** [keymano.ys.contact](https://keymano.ys.contact) 可选使用 **Google Analytics**（匿名页面访问统计）。你的 `.keylayout` 工作不会离开浏览器。自托管实例默认无分析，除非运营者启用。见 [PRIVACY.md](../../PRIVACY.md)。\n\n",
        "- 📘 入门（英文、通俗）: [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "zh-Hant": (
        "> 🟢 **不熟悉 GitHub 或不是開發者？** 請閱讀通俗英文 **[入門指南](../../docs/GETTING_STARTED.md)**。\n\n",
        "- **儲存 vs. 另存新檔** — 儲存會覆寫目前檔案；另存新檔會建立副本。\n",
        "## 隱私\n\n**桌面應用程式**不收集任何資料，可完全離線使用。**代管 Web 應用** [keymano.ys.contact](https://keymano.ys.contact) 可選用 **Google Analytics**（匿名頁面瀏覽統計）。你的 `.keylayout` 工作不會離開瀏覽器。自架實例預設無分析，除非營運者啟用。見 [PRIVACY.md](../../PRIVACY.md)。\n\n",
        "- 📘 入門（英文、通俗）: [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ko": (
        "> 🟢 **GitHub이 처음이거나 개발자가 아니신가요?** 쉬운 영어 **[시작 가이드](../../docs/GETTING_STARTED.md)**를 읽어 보세요.\n\n",
        "- **저장 vs. 다른 이름으로 저장** — 저장은 현재 파일을 덮어쓰고, 다른 이름으로 저장은 복사본을 만듭니다.\n",
        "## 개인정보\n\n**데스크톱 앱**은 아무것도 수집하지 않으며 오프라인으로 동작합니다. **호스팅 웹 앱** [keymano.ys.contact](https://keymano.ys.contact)은 선택적으로 **Google Analytics**(익명 페이지 조회 통계)를 사용합니다. `.keylayout` 작업은 브라우저를 벗어나지 않습니다. 자체 호스팅 인스턴스는 운영자가 켜지 않는 한 분석이 없습니다. [PRIVACY.md](../../PRIVACY.md) 참고.\n\n",
        "- 📘 시작하기(영어, 쉬운 설명): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "hi": (
        "> 🟢 **GitHub पर नए हैं या डेवलपर नहीं?** सरल अंग्रेज़ी **[शुरुआती गाइड](../../docs/GETTING_STARTED.md)** पढ़ें।\n\n",
        "- **सेव बनाम सेव As** — सेव वर्तमान फ़ाइल को ओवरराइट करता है; सेव As एक कॉपी बनाता है।\n",
        "## गोपनीयता\n\n**डेस्कटॉप ऐप** कुछ भी एकत्र नहीं करता और ऑफ़लाइन चलता है। **होस्टेड वेब ऐप** [keymano.ys.contact](https://keymano.ys.contact) वैकल्पिक रूप से **Google Analytics** (अनाम पेज-व्यू आँकड़े) उपयोग करता है। आपका `.keylayout` काम ब्राउज़र से बाहर नहीं जाता। सेल्फ-होस्ट पर डिफ़ॉल्ट रूप से कोई एनालिटिक्स नहीं, जब तक ऑपरेटर सक्षम न करे। [PRIVACY.md](../../PRIVACY.md) देखें।\n\n",
        "- 📘 शुरुआत (अंग्रेज़ी, सरल): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ar": (
        "> 🟢 **جديد على GitHub أو لست مطوّرًا؟** اقرأ **[دليل البدء (بالإنجليزية)](../../docs/GETTING_STARTED.md)** بلغة بسيطة.\n\n",
        "- **حفظ مقابل حفظ باسم** — الحفظ يستبدل الملف الحالي؛ حفظ باسم ينشئ نسخة.\n",
        "## الخصوصية\n\n**تطبيق سطح المكتب** لا يجمع أي بيانات ويعمل دون اتصال. **التطبيق المستضاف** على [keymano.ys.contact](https://keymano.ys.contact) يستخدم اختياريًا **Google Analytics** (إحصاءات صفحات مجهولة). عملك على `.keylayout` لا يغادر المتصفح أبدًا. الاستضافة الذاتية بلا تحليلات ما لم يفعّلها المشغّل. راجع [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 البدء (إنجليزي، مبسّط): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "bn": (
        "> 🟢 **GitHub-এ নতুন বা ডেভেলপার নন?** সহজ ইংরেজি **[শুরুর গাইড](../../docs/GETTING_STARTED.md)** পড়ুন।\n\n",
        "- **সেভ বনাম সেভ As** — সেভ বর্তমান ফাইল ওভাররাইট করে; সেভ As একটি কপি তৈরি করে।\n",
        "## গোপনীয়তা\n\n**ডেস্কটপ অ্যাপ** কিছুই সংগ্রহ করে না এবং অফলাইনে চলে। **হোস্টেড ওয়েব অ্যাপ** [keymano.ys.contact](https://keymano.ys.contact)-এ ঐচ্ছিকভাবে **Google Analytics** (বেনামী পৃষ্ঠা-দেখার পরিসংখ্যান) ব্যবহার করে। আপনার `.keylayout` কাজ ব্রাউজার ছাড়ে না। সেল্ফ-হোস্টে ডিফল্টভাবে অ্যানালিটিক্স নেই, অপারেটর চালু না করলে। [PRIVACY.md](../../PRIVACY.md) দেখুন।\n\n",
        "- 📘 শুরু (ইংরেজি, সহজ): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "id": (
        "> 🟢 **Baru di GitHub atau bukan pengembang?** Baca **[panduan memulai (Bahasa Inggris)](../../docs/GETTING_STARTED.md)** yang mudah dipahami.\n\n",
        "- **Simpan vs. Simpan Sebagai** — Simpan menimpa file saat ini; Simpan Sebagai membuat salinan.\n",
        "## Privasi\n\n**Aplikasi desktop** tidak mengumpulkan apa pun dan berjalan offline. **Aplikasi web yang di-host** di [keymano.ys.contact](https://keymano.ys.contact) secara opsional memakai **Google Analytics** (statistik tampilan halaman anonim). Pekerjaan `.keylayout` Anda tidak pernah meninggalkan browser. Instansi self-host tidak punya analitik kecuali operator mengaktifkannya. Lihat [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Memulai (Inggris, sederhana): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ur": (
        "> 🟢 **GitHub پر نئے ہیں یا ڈویلپر نہیں؟** آسان انگریزی **[شروع کی گائیڈ](../../docs/GETTING_STARTED.md)** پڑھیں۔\n\n",
        "- **محفوظ بمقابلہ محفوظ بطور** — محفوظ موجودہ فائل کو اووررائٹ کرتا ہے؛ محفوظ بطور ایک کاپی بناتا ہے۔\n",
        "## رازداری\n\n**ڈیسک ٹاپ ایپ** کچھ بھی جمع نہیں کرتی اور آف لائن چلتی ہے۔ **ہوسٹ شدہ ویب ایپ** [keymano.ys.contact](https://keymano.ys.contact) پر اختیاری طور پر **Google Analytics** (گمنام صفحہ دیکھنے کے اعداد) استعمال ہو سکتا ہے۔ آپ کا `.keylayout` کام براؤزر سے باہر نہیں جاتا۔ سیلف ہوسٹ پر ڈیفالٹ کوئی تجزیہ نہیں جب تک آپریٹر فعال نہ کرے۔ [PRIVACY.md](../../PRIVACY.md) دیکھیں۔\n\n",
        "- 📘 شروع (انگریزی، آسان): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "tr": (
        "> 🟢 **GitHub'da yeni misiniz veya geliştirici değil misiniz?** Sade İngilizce **[başlangıç kılavuzu](../../docs/GETTING_STARTED.md)** okuyun.\n\n",
        "- **Kaydet vs. Farklı Kaydet** — Kaydet geçerli dosyanın üzerine yazar; Farklı Kaydet bir kopya oluşturur.\n",
        "## Gizlilik\n\n**Masaüstü uygulaması** hiçbir şey toplamaz ve çevrimdışı çalışır. **Barındırılan web uygulaması** [keymano.ys.contact](https://keymano.ys.contact) isteğe bağlı **Google Analytics** (anonim sayfa görüntüleme istatistikleri) kullanır. `.keylayout` çalışmanız tarayıcıdan çıkmaz. Kendi barındırdığınız kurulumda operatör açmadıkça analitik yoktur. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Başlangıç (İngilizce, sade): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "vi": (
        "> 🟢 **Mới dùng GitHub hoặc không phải lập trình viên?** Đọc **[hướng dẫn bắt đầu (tiếng Anh)](../../docs/GETTING_STARTED.md)** dễ hiểu.\n\n",
        "- **Lưu vs. Lưu thành** — Lưu ghi đè tệp hiện tại; Lưu thành tạo bản sao.\n",
        "## Quyền riêng tư\n\n**Ứng dụng desktop** không thu thập gì và chạy ngoại tuyến. **Ứng dụng web được lưu trữ** tại [keymano.ys.contact](https://keymano.ys.contact) tùy chọn dùng **Google Analytics** (thống kê lượt xem trang ẩn danh). Công việc `.keylayout` của bạn không rời trình duyệt. Tự lưu trữ mặc định không có phân tích trừ khi người vận hành bật. Xem [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 Bắt đầu (tiếng Anh, đơn giản): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "fa": (
        "> 🟢 **تازه‌وارد GitHub هستید یا توسعه‌دهنده نیستید؟** **[راهنمای شروع (انگلیسی)](../../docs/GETTING_STARTED.md)** ساده را بخوانید.\n\n",
        "- **ذخیره در برابر ذخیره با نام** — ذخیره فایل فعلی را بازنویسی می‌کند؛ ذخیره با نام یک کپی می‌سازد.\n",
        "## حریم خصوصی\n\n**برنامه دسکتاپ** چیزی جمع‌آوری نمی‌کند و آفلاین کار می‌کند. **برنامه وب میزبانی‌شده** در [keymano.ys.contact](https://keymano.ys.contact) اختیاری از **Google Analytics** (آمار ناشناس بازدید صفحه) استفاده می‌کند. کار `.keylayout` شما هرگز مرورگر را ترک نمی‌کند. میزبانی خودکار بدون تحلیل است مگر اپراتور فعال کند. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 شروع (انگلیسی، ساده): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "ta": (
        "> 🟢 **GitHub-ல் புதியவரா அல்லது டெவலப்பர் அல்லவா?** எளிய ஆங்கில **[தொடக்க வழிகாட்டி](../../docs/GETTING_STARTED.md)** படியுங்கள்.\n\n",
        "- **சேமி vs. வேறு பெயரில் சேமி** — சேமி தற்போதைய கோப்பை மேலெழுதும்; வேறு பெயரில் சேமி நகலை உருவாக்கும்.\n",
        "## தனியுரிமை\n\n**டெஸ்க்டாப் பயன்பாடு** எதையும் சேகரிக்காது, ஆஃப்லைனில் இயங்கும். **ஹோஸ்ட் செய்யப்பட்ட வலைப் பயன்பாடு** [keymano.ys.contact](https://keymano.ys.contact)-ல் விருப்பமாக **Google Analytics** (அநாமிக பக்க பார்வை புள்ளிவிவரங்கள்) பயன்படுத்தும். உங்கள் `.keylayout` வேலை உலாவியை விட்டு வெளியேறாது. சுய-ஹோஸ்டில் இயக்குநர் இயக்கும் வரை பகுப்பாய்வு இல்லை. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 தொடக்கம் (ஆங்கிலம், எளிது): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
    "mr": (
        "> 🟢 **GitHub वर नवीन किंवा डेव्हलपर नाही?** सोप्या इंग्रजीत **[प्रारंभ मार्गदर्शक](../../docs/GETTING_STARTED.md)** वाचा.\n\n",
        "- **जतन करा vs. म्हणून जतन करा** — जतन करा सध्याची फाइल ओव्हरराइट करते; म्हणून जतन करा प्रत तयार करते.\n",
        "## गोपनीयता\n\n**डेस्कटॉप अॅप** काहीही गोळा करत नाही आणि ऑफलाइन चालते. **होस्ट केलेले वेब अॅप** [keymano.ys.contact](https://keymano.ys.contact) वर पर्यायी **Google Analytics** (अनामिक पृष्ठ-दृश्य आकडेवारी) वापरते. तुमचे `.keylayout` काम ब्राउझर सोडत नाही. सेल्फ-होस्टवर ऑपरेटर सक्षम करेपर्यंत विश्लेषण नाही. [PRIVACY.md](../../PRIVACY.md).\n\n",
        "- 📘 प्रारंभ (इंग्रजी, सोपे): [Getting Started](../../docs/GETTING_STARTED.md)\n",
    ),
}

LINK_HEADERS = {
    "de": "## Links",
    "fr": "## Liens",
    "es": "## Enlaces",
    "it": "## Link",
    "pt": "## Links",
    "nl": "## Links",
    "pl": "## Linki",
    "uk": "## Посилання",
    "ru": "## Ссылки",
    "ja": "## リンク",
    "zh-Hans": "## 链接",
    "zh-Hant": "## 連結",
    "ko": "## 링크",
    "hi": "## लिंक",
    "ar": "## الروابط",
    "bn": "## লিঙ্কসমূহ",
    "id": "## Tautan",
    "ur": "## روابط",
    "tr": "## Bağlantılar",
    "vi": "## Liên kết",
    "fa": "## پیوندها",
    "ta": "## இணைப்புகள்",
    "mr": "## दुवे",
}

LANG_LINE_RE = re.compile(r"^- .*(24 |24 言語|24 idiomas|24 langues|24 Sprachen|24 język|24 talen|24 lingue|24 язык|24 мов|24 भाषा|24 لغة|24 ভাষা|24 bahasa|24 dil|24 ngôn ngữ|24 زبان|24 மொழி|24 भाष)")


def patch_file(path: Path, lang: str) -> None:
    text = path.read_text(encoding="utf-8")
    if "GETTING_STARTED.md" in text and "Google Analytics" in text:
        text = text.replace("Code स्रोत", "Code source")
        path.write_text(text, encoding="utf-8")
        return

    gs, save, privacy, gs_link = PATCHES[lang]
    link_hdr = LINK_HEADERS[lang]

    # After first 🌐 blockquote
    text = re.sub(
        r"(^> 🌐 .+\n)\n",
        r"\1\n" + gs,
        text,
        count=1,
        flags=re.MULTILINE,
    )

    # After features list, before privacy
    if save.strip() not in text:
        text = text.replace(privacy, save + privacy, 1)

    # Before links header
    text = text.replace(f"\n{link_hdr}\n", f"\n{privacy}{link_hdr}\n", 1)

    # Getting started link before full README link
    if gs_link.strip() not in text:
        text = text.replace(
            f"- 📖 ",
            gs_link + f"- 📖 ",
            1,
        )

    text = text.replace("Code स्रोत", "Code source")
    path.write_text(text, encoding="utf-8")


def main() -> None:
    for path in sorted(I18N.glob("README.*.md")):
        lang = path.stem.removeprefix("README.")
        if lang not in PATCHES:
            print(f"skip {path.name}")
            continue
        patch_file(path, lang)
        print(f"patched {path.name}")


if __name__ == "__main__":
    main()
