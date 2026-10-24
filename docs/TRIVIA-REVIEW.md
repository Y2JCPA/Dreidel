# Trivia bank: items for review

The 150 questions (50 per level) were written from passages fetched from the Sefaria API. A script then checked every Hebrew and English quote word for word against the cited passage. These are the questions where the writer flagged a judgment call. Each is correct as worded, but a knowledgeable player might push back.

## Kids (`data/questions-kids.js`)
- **k36: lighting time.** Follows the Shulchan Arukh ("at the end of sunset"). The Kitzur (139:10) says when the stars come out, so families who light at nightfall may question it.
- **k29: each household member lights.** Follows the Rema (Ashkenazi custom) and says so. The bank doesn't show the Sephardi practice of one menorah per house.
- **k04: Antiochus's nickname.** The Hebrew is הַבּוֹרֵחַ ("the runaway"); Sefaria's English says "the Coward". The English option gives both.
- **k13: Al HaNisim.** Follows the prayer's wording that lights were lit "in the courtyards". The Temple menorah itself stood inside.
- **k23: Yehudit and the cheese.** Uses the Rema's brief mention and avoids the graphic version in Kitzur 139:3.
- **k45: Shabbat 23b.** "Candles for Shabbat and Chanukah" is the Koren English's wording; the Hebrew says "one who is regular with lights".
- **k50: Zechariah 4.** Sourced only to Zechariah 4. It doesn't claim this is the haftarah.
- **Left out on purpose:** violent passages (the cave, Chana and her sons, Elazar and the elephant), which son was eldest (Megillat Antiochus and Maccabees I disagree), and the meaning of the dreidel letters (no Sefaria source found).

## Adults (`data/questions-adults.js`)
- **a49: Tachanun at Mincha of Erev Chanukah (Rema 683).** The Hebrew gloss says "גם בערב חנוכה במנחה", but Sefaria's English translation leaves that phrase out. The Hebrew quote proves the answer; the English quote doesn't.
- **a01: lighting "at the end of sunset" (SA 672:1).** Correct as the Shulchan Arukh's wording. The Mishnah Berurah reads it as nightfall and notes that many light earlier.
- **a37: Motzei Shabbat order at home (MB 681:3).** The English quote is a condensed translation. The Hebrew conclusion "דעביד כמר עביד ודעביד כמר עביד" is clear.
- **a20: studying by the Chanukah light (SA 673:1).** Asks for the first, unattributed view. The text also brings a view that permits it, and the quote shows both.
- **a24 and a28: travellers.** Asked as the Kitzur's view (139:19), which says a traveller whose wife lights at home lights without the blessings. The Rema (677:3) differs.
- **Synagogue questions (SA 671:7).** In this Lemberg edition, "אין אדם יוצא בנרות של בית הכנסת" sits inside the Rema's gloss, so it is credited to the Rema.
- **English translations by the writer** (`enTranslated: true`, shown in the game as "English translation"): a18, a29, a36, a37, a44. These are Mishnah Berurah passages, which have no English on Sefaria.

## Talmid Chacham (`data/questions-tc.js`)
- **t09: "place it within ten handbreadths".** Shabbat 21b has Ravina in the name of **Rabba**; Bava Kamma 62b has **Rava**. The question names only Ravina.
- **t16:** the Hebrew has רב הונא בריה ד**רב** יהושע; Sefaria's English has "Rabbi Yehoshua". The question follows the Hebrew.
- **t04 and t05: Ulla's two Amoraim.** The Gemara says only "one said… and one said", so neither reason is tied to a name.
- **t22:** quotes the corrected reading "[אָמַר] רָבָא".
- **t29 (Soferim 20:5):** the "[and also because…]" joining Beit Hillel's two reasons is the Soncino translator's addition.
- **t31 (Soferim 20:9):** the Vilna Hebrew leaves Sukkot out of the 18-day list, though the English includes it. This doesn't affect the answer.
- **English translations by the writer:** the 6 Mishnah Berurah questions.
- **Not covered:** "חבית שבורה / ערב שבת" wasn't found in the fetched passages, so no question asks about it.
