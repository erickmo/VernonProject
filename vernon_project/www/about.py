import frappe
from vernon_project.www._i18n import base_context, norm_lang, pick

ROUTE = "/about"


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="about", lang=lang, path=ROUTE)

    context.page_title = pick(
        {
            "id": "Tentang VernonCorp — berbisnis untuk membuat orang bahagia",
            "en": "About VernonCorp — in the business of making people happy",
        },
        lang,
    )
    context.meta_description = pick(
        {
            "id": "Kisah, misi, dan nilai VernonCorp: perusahaan layanan bisnis Indonesia yang menaruh manusia di pusat segalanya — tujuh pemangku kepentingan yang kami buat bahagia.",
            "en": "The story, mission and values of VernonCorp: an Indonesian business services company that puts people at the centre of everything — the seven stakeholders we set out to make happy.",
        },
        lang,
    )
    context.page_canonical = "https://project-www.vernon.id" + ROUTE + ("?lang=en" if lang == "en" else "")
    context.og_title = context.page_title
    context.og_description = context.meta_description
    context.og_type = "website"

    context.page_jsonld = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "VernonCorp",
                    "item": "https://project-www.vernon.id",
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": pick({"id": "Tentang", "en": "About"}, lang),
                    "item": context.page_canonical,
                },
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            "name": context.page_title,
            "url": context.page_canonical,
            "inLanguage": lang,
            "about": {"@id": "https://project-www.vernon.id/#organization"},
            "mainEntity": {
                "@type": "Organization",
                "name": "VernonCorp",
                "slogan": "In the business of making people happy",
                "foundingLocation": {"@type": "Place", "name": "Indonesia"},
            },
        },
    ]

    # ---- content --------------------------------------------------------------
    p = lambda d: pick(d, lang)

    context.eyebrow = p({"id": "Cerita kami", "en": "Our story"})
    context.h1_a = p({"id": "Tentang", "en": "About"})
    context.h1_b = "VernonCorp"
    context.hero_lead = p(
        {
            "id": "Kami perusahaan layanan bisnis Indonesia dengan satu misi yang kami ucapkan tanpa malu-malu: berbisnis untuk membuat orang bahagia.",
            "en": "We are an Indonesian business services company with one mission we say out loud, without irony: we are in the business of making people happy.",
        }
    )
    context.hero_mission = p(
        {
            "id": "Berbisnis untuk membuat orang bahagia",
            "en": "In the business of making people happy",
        }
    )

    context.stats = [
        {"n": 8, "suffix": "", "label": p({"id": "bidang usaha, satu misi", "en": "businesses, one mission"})},
        {"n": 7, "suffix": "", "label": p({"id": "pemangku kepentingan yang kami jaga", "en": "stakeholders we care for"})},
        {"n": 3, "suffix": "", "label": p({"id": "nilai yang memandu setiap keputusan", "en": "values guiding every decision"})},
    ]

    context.sectors_label = p({"id": "Bidang usaha kami", "en": "Our businesses"})
    context.sectors = [p(s) for s in [
        {"id": "Hotel", "en": "Hotels"},
        {"id": "Makanan & Minuman", "en": "Food & Beverage"},
        {"id": "Pendidikan", "en": "Education"},
        {"id": "Layanan Bisnis", "en": "Business Services"},
        {"id": "Ritel", "en": "Retail"},
        {"id": "Teknologi", "en": "Technology"},
        {"id": "Spa", "en": "Spa"},
        {"id": "Layanan Masyarakat", "en": "Community Service"},
    ]]

    context.story_title = p({"id": "Kenapa kami ada", "en": "Why we exist"})
    context.story_paras = [
        p(
            {
                "id": "VernonCorp lahir dari pertanyaan sederhana: bagaimana kalau sebuah perusahaan mengukur keberhasilan bukan dari seberapa besar ia tumbuh, tapi dari seberapa banyak orang yang hidupnya menjadi sedikit lebih ringan karenanya? Kami mulai bukan dengan produk, tapi dengan manusia — tim kecil yang lelah melihat teknologi memperlakukan orang sebagai angka.",
                "en": "VernonCorp began with a simple question: what if a company measured success not by how big it grew, but by how many people had their lives made a little lighter because of it? We started not with a product but with people — a small team tired of watching technology treat humans as numbers.",
            }
        ),
        p(
            {
                "id": "Jadi kami membangun ke arah sebaliknya. Setiap fitur dimulai dari satu orang sungguhan dan satu hari yang berat dalam hidupnya. Kalau sebuah keputusan membuat pekerjaan seseorang lebih adil, lebih jelas, atau lebih manusiawi, keputusan itu benar. Kalau tidak, kami tidak peduli seberapa pintar teknologinya.",
                "en": "So we built in the opposite direction. Every feature starts with one real person and one hard day in their life. If a decision makes someone's work fairer, clearer, or more humane, it is the right decision. If it does not, we don't care how clever the technology is.",
            }
        ),
        p(
            {
                "id": "Hari ini VernonCorp adalah rumah bagi orang-orang yang percaya bahwa kebaikan dan ketelitian bukan lawan. Kami serius soal kualitas justru karena kami serius soal orang yang bergantung padanya.",
                "en": "Today VernonCorp is home to people who believe kindness and rigour are not opposites. We are serious about quality precisely because we are serious about the people who depend on it.",
            }
        ),
    ]

    context.mission_title = p({"id": "Apa artinya, setiap hari", "en": "What it means, day to day"})
    context.mission_lead = p(
        {
            "id": "“Membuat orang bahagia” bukan slogan yang digantung di dinding. Ini pekerjaan sehari-hari, dan seperti ini bentuknya:",
            "en": "“Making people happy” is not a slogan on a wall. It is daily work, and this is what it looks like:",
        }
    )
    context.mission_points = [
        {
            "t": p({"id": "Menghapus gesekan kecil", "en": "Removing small frictions"}),
            "d": p(
                {
                    "id": "Satu langkah yang tidak perlu, satu formulir yang membingungkan, satu menunggu yang bikin cemas — kami memburunya sampai hilang.",
                    "en": "One needless step, one confusing form, one anxious wait — we hunt them down until they are gone.",
                }
            ),
        },
        {
            "t": p({"id": "Membuat yang adil terasa jelas", "en": "Making fairness visible"}),
            "d": p(
                {
                    "id": "Orang bahagia ketika mereka tahu aturannya jujur. Kami tunjukkan cara sistem bekerja, bukan menyembunyikannya.",
                    "en": "People are happy when they trust the rules are honest. We show how the system works instead of hiding it.",
                }
            ),
        },
        {
            "t": p({"id": "Merayakan orang, bukan angka", "en": "Celebrating people, not metrics"}),
            "d": p(
                {
                    "id": "Kemajuan seseorang layak dilihat dan diakui. Produk kami dirancang untuk mengangkat, bukan mengawasi.",
                    "en": "A person's progress deserves to be seen and acknowledged. Our products are built to lift people up, not to surveil them.",
                }
            ),
        },
    ]

    context.values_title = p({"id": "Tiga nilai kami", "en": "Our three values"})
    context.values_lead = p(
        {
            "id": "Semua keputusan kami saring lewat tiga hal ini — bukan poster, tapi alat kerja.",
            "en": "Every decision passes through these three — not posters, but working tools.",
        }
    )
    context.values = [
        {
            "no": "01",
            "t": p({"id": "Empati lebih dulu", "en": "Empathy first"}),
            "d": p(
                {
                    "id": "Kami mulai dari perasaan orang yang akan memakai, bukan dari fitur yang ingin kami pamerkan.",
                    "en": "We start from the feelings of the person who will use it, not the feature we want to show off.",
                }
            ),
            "eg": p(
                {
                    "id": "Contoh: setiap halaman kami diuji dengan keyboard dan pembaca layar dulu — supaya seseorang yang tak bisa memakai mouse tetap merasa diundang, bukan ditinggalkan.",
                    "en": "In practice: every page we ship is tested with a keyboard and screen reader first — so someone who cannot use a mouse still feels invited, not left behind.",
                }
            ),
        },
        {
            "no": "02",
            "t": p({"id": "Lakukan yang benar", "en": "Do what is right"}),
            "d": p(
                {
                    "id": "Yang benar tidak selalu yang paling menyenangkan sesaat. Kami memilih benar, lalu menjelaskannya dengan hormat.",
                    "en": "What is right is not always what feels nicest in the moment. We choose right, then explain it with respect.",
                }
            ),
            "eg": p(
                {
                    "id": "Contoh: kami menolak menambahkan pola gelap yang menaikkan angka tapi menjebak pengguna — sekalipun itu berarti pertumbuhan lebih lambat.",
                    "en": "In practice: we refuse dark patterns that lift numbers but trap users — even when it means slower growth.",
                }
            ),
        },
        {
            "no": "03",
            "t": p({"id": "Kualitas sebagai kepedulian", "en": "Quality as care"}),
            "d": p(
                {
                    "id": "Kerja yang rapi adalah bentuk hormat pada orang yang bergantung padanya. Kami mengurus detail karena orang mengurus hidupnya lewat kami.",
                    "en": "Careful work is a form of respect for the people who depend on it. We sweat the details because people run their lives through us.",
                }
            ),
            "eg": p(
                {
                    "id": "Contoh: kami menghormati mode “kurangi gerak” dan kontras warna AA — kenyamanan seseorang lebih penting daripada animasi yang keren.",
                    "en": "In practice: we honour reduced-motion and AA colour contrast — one person's comfort matters more than a flashy animation.",
                }
            ),
        },
    ]

    context.stake_title = p({"id": "Tujuh yang kami buat bahagia", "en": "The seven we set out to make happy"})
    context.stake_lead = p(
        {
            "id": "Kebahagiaan bukan hanya milik pelanggan. Kami menggambar lingkaran yang lebih besar — tujuh pemangku kepentingan, satu peta empati.",
            "en": "Happiness is not only the customer's. We draw a bigger circle — seven stakeholders, one empathy map.",
        }
    )
    context.stakeholders = [
        {
            "id_": "01",
            "name": p({"id": "Tuhan", "en": "God"}),
            "who": p({"id": "Sumber makna dari pekerjaan kami.", "en": "The source of meaning in our work."}),
            "happy": p(
                {
                    "id": "Kami bekerja dengan jujur dan penuh syukur, memperlakukan setiap amanah — orang, data, dan kepercayaan — sebagai titipan yang dijaga.",
                    "en": "We work honestly and gratefully, treating every trust — people, data, and confidence placed in us — as something to be safeguarded.",
                }
            ),
        },
        {
            "id_": "02",
            "name": p({"id": "Pelanggan", "en": "Customers"}),
            "who": p({"id": "Orang yang menaruh harinya di tangan kami.", "en": "People who put their day in our hands."}),
            "happy": p(
                {
                    "id": "Kami membuat pekerjaan mereka lebih ringan, jelas, dan adil — lalu keluar dari jalan mereka.",
                    "en": "We make their work lighter, clearer and fairer — then get out of their way.",
                }
            ),
        },
        {
            "id_": "03",
            "name": p({"id": "Tim", "en": "Teams"}),
            "who": p({"id": "Orang-orang yang membangun ini setiap hari.", "en": "The people who build this every day."}),
            "happy": p(
                {
                    "id": "Kami menjaga mereka: pekerjaan yang bermakna, rasa aman untuk bicara jujur, dan pengakuan yang tulus.",
                    "en": "We look after them: meaningful work, safety to speak honestly, and recognition that is sincere.",
                }
            ),
        },
        {
            "id_": "04",
            "name": p({"id": "Pemegang Saham", "en": "Shareholders"}),
            "who": p({"id": "Yang mempercayakan modal dan sabar bersama kami.", "en": "Those who entrust capital and stay patient with us."}),
            "happy": p(
                {
                    "id": "Kami tumbuh dengan cara yang bisa dipertanggungjawabkan — hasil yang bertahan, dibangun di atas kepercayaan, bukan jalan pintas.",
                    "en": "We grow in a way we can stand behind — durable returns built on trust, not shortcuts.",
                }
            ),
        },
        {
            "id_": "05",
            "name": p({"id": "Mitra", "en": "Partners"}),
            "who": p({"id": "Yang berjalan seiring dengan kami.", "en": "Those who walk alongside us."}),
            "happy": p(
                {
                    "id": "Kami menepati janji, berbagi keberhasilan dengan adil, dan hadir saat keadaan sulit.",
                    "en": "We keep our promises, share success fairly, and show up when things get hard.",
                }
            ),
        },
        {
            "id_": "06",
            "name": p({"id": "Pemasok", "en": "Suppliers"}),
            "who": p({"id": "Yang membuat pekerjaan kami mungkin.", "en": "Those who make our work possible."}),
            "happy": p(
                {
                    "id": "Kami membayar tepat waktu, bernegosiasi dengan hormat, dan memperlakukan mereka sebagai rekan, bukan biaya.",
                    "en": "We pay on time, negotiate with respect, and treat them as partners, not line items.",
                }
            ),
        },
        {
            "id_": "07",
            "name": p({"id": "Masyarakat", "en": "Society"}),
            "who": p({"id": "Indonesia dan dunia tempat kami hidup.", "en": "The Indonesia and world we live in."}),
            "happy": p(
                {
                    "id": "Kami meninggalkan lingkungan sekitar sedikit lebih baik daripada saat kami tiba — dalam kesempatan, akses, dan kepercayaan.",
                    "en": "We leave the world around us a little better than we found it — in opportunity, access, and trust.",
                }
            ),
        },
    ]

    context.culture_kicker = p({"id": "Budaya kami", "en": "Our culture"})
    context.culture_title = p(
        {
            "id": "Lakukan yang benar, bukan yang enak",
            "en": "Do what is right, not what is nice",
        }
    )
    context.culture_paras = [
        p(
            {
                "id": "Ramah itu mudah — cukup setuju dengan semua orang. Benar itu lebih sulit: kadang berarti mengatakan tidak, mengakui kesalahan lebih dulu, atau memilih jalan yang lebih lambat karena jalan itu jujur.",
                "en": "Nice is easy — just agree with everyone. Right is harder: sometimes it means saying no, owning a mistake before anyone asks, or choosing the slower path because it is the honest one.",
            }
        ),
        p(
            {
                "id": "Kami memilih benar, lalu menyampaikannya dengan kelembutan. Karena kepedulian tanpa kejujuran itu kosong, dan kejujuran tanpa kepedulian itu kejam. Keduanya, selalu.",
                "en": "We choose right, then deliver it with gentleness. Because care without honesty is hollow, and honesty without care is cruel. Both, always.",
            }
        ),
    ]

    context.cta_title = p(
        {"id": "Mau ikut membuat orang bahagia?", "en": "Want to help make people happy?"}
    )
    context.cta_lead = p(
        {
            "id": "Kalau nilai-nilai ini terasa seperti milikmu, mari bicara.",
            "en": "If these values feel like yours, let's talk.",
        }
    )
    context.cta_primary = {"label": p({"id": "Lihat lowongan", "en": "See open roles"}), "url": "/careers" + ("?lang=en" if lang == "en" else "")}
    context.cta_secondary = {"label": p({"id": "Hubungi kami", "en": "Contact us"}), "url": "/contact" + ("?lang=en" if lang == "en" else "")}
    context.corporate_link = {"label": p({"id": "Pelajari lebih lanjut tentang VernonCorp di vernon.id", "en": "Learn more about VernonCorp at vernon.id"}), "url": "https://vernon.id"}
