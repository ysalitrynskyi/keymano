# Keymano — macOS விசைப்பலகை அமைப்பு திருத்தி

> 🌐 இது ஒரு மொழிபெயர்க்கப்பட்ட சுருக்கம். முழு ஆவணப்படுத்தல் ஆங்கிலத்தில் உள்ளது: **[README](../../README.md)**.

> 🟢 **GitHub-ல் புதியவரா அல்லது டெவலப்பர் அல்லவா?** எளிய ஆங்கில **[தொடக்க வழிகாட்டி](../../docs/GETTING_STARTED.md)** படியுங்கள்.

**Keymano** என்பது macOS `.keylayout` கோப்புகள் மற்றும் `.bundle` விசைப்பலகை தொகுப்புகளுக்கான ஒரு இலவச, திறந்த மூல, குறுக்கு-தளம் திருத்தி — Ukelele-க்கு ஒரு திறந்த மூல மாற்று. macOS, Windows, Linux, அல்லது உங்கள் உலாவியிலேயே, நேரலையில் சொடுக்கக்கூடிய விசைப்பலகையுடன் macOS விசைப்பலகை அமைப்புகளை உருவாக்கவும், திருத்தவும், ஆய்வு செய்யவும்.

## இதை இயக்க மூன்று வழிகள்

- **டெஸ்க்டாப் செயலியைப் பதிவிறக்கவும்** — macOS, Windows, அல்லது Linuxக்கு, [Releases page](https://github.com/ysalitrynskyi/keymano/releases) இலிருந்து.
- **macOS:** Unsigned build — after installing from the `.dmg`, see **[First launch on macOS (English)](../../docs/GETTING_STARTED.md#first-launch-on-macos-important)** for the one-time Terminal step if macOS blocks the app.
- **உங்கள் உலாவியில் பயன்படுத்தவும்** — **[keymano.ys.contact](https://keymano.ys.contact)** இல் ஹோஸ்ட் செய்யப்பட்ட செயலியைத் திறக்கவும் (பராமரிப்பாளர் வழங்கியது); முழு செயலியும் உங்கள் உலாவியிலேயே இயங்கும், நிறுவல் தேவையில்லை.
- **வலைப் பதிப்பின் வரம்புகள்:** உலாவியில் தனி `.keylayout` கோப்புகளைத் திறந்து `.keylayout` அல்லது `.bundle.zip` ஆக ஏற்றுமதி செய்யலாம். உலாவி `.bundle` folder-களை நேரடியாக import செய்ய முடியாது, `~/Library/Keyboard Layouts/`-ல் install செய்ய முடியாது, அல்லது installed system layouts-ஐ browse செய்ய முடியாது. அவற்றுக்கு desktop app-ஐப் பயன்படுத்தவும்.
- **மூலக் குறியிலிருந்து கட்டமைக்கவும்** — பங்களிப்பாளர்களுக்காக; [English README](../../README.md#build-from-source) ஐப் பார்க்கவும்.

## அம்சங்கள்

- காட்சிப்பூர்வ திருத்தி — எந்த விசையையும் சொடுக்கி, எந்த மாற்றி இணைப்புக்கும் மற்றும் dead-key நிலைக்கும் அதன் வெளியீட்டை அமைக்கலாம்
- Dead keys, terminators, and modifier maps
- ANSI / ISO / JIS இயற்பியல் விசைப்பலகை வடிவவியல்
- Apple-இன் சொந்த `.keylayout` XML மற்றும் `.bundle` தொகுப்புகளைப் படிக்கும் மற்றும் எழுதும்
- ஒரு சொடுக்கில் தானியங்கி பழுதுபார்ப்புடன் சரிபார்ப்பு; PNG மற்றும் குறிப்பு-தாள் ஏற்றுமதி
- 24 மொழிகளில் இடைமுகம்

- **சேமி vs. வேறு பெயரில் சேமி** — சேமி தற்போதைய கோப்பை மேலெழுதும்; வேறு பெயரில் சேமி நகலை உருவாக்கும்.
## தனியுரிமை

**டெஸ்க்டாப் பயன்பாடு** எதையும் சேகரிக்காது, ஆஃப்லைனில் இயங்கும். **ஹோஸ்ட் செய்யப்பட்ட வலைப் பயன்பாடு** [keymano.ys.contact](https://keymano.ys.contact)-ல் விருப்பமாக **Google Analytics** (அநாமிக பக்க பார்வை புள்ளிவிவரங்கள்) பயன்படுத்தும். உங்கள் `.keylayout` வேலை உலாவியை விட்டு வெளியேறாது. சுய-ஹோஸ்டில் இயக்குநர் இயக்கும் வரை பகுப்பாய்வு இல்லை. [PRIVACY.md](../../PRIVACY.md).

## இணைப்புகள்

- 🌍 நேரலை வலை செயலி: <https://keymano.ys.contact>
- 📦 பதிவிறக்கங்கள்: <https://github.com/ysalitrynskyi/keymano/releases>
- 📘 தொடக்கம் (ஆங்கிலம், எளிது): [Getting Started](../../docs/GETTING_STARTED.md)
- 📖 முழு ஆவணப்படுத்தல் (ஆங்கிலம்): [README](../../README.md)
- 🐙 மூலக் குறியீடு: <https://github.com/ysalitrynskyi/keymano>

---

*Keymano Apple அல்லது SIL International உடன் தொடர்பில்லாத சுயாதீன திட்டம். "Apple", "macOS", "Ukelele" அவற்றின் உரிமையாளர்களின் வர்த்தகமுத்திரைகள்.*
