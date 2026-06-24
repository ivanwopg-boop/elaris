"""News category keyword library for hot-list relevance filtering.

Each persona is associated with 1-4 categories. Each category has a flat
list of keywords (zh + en). When pre-filtering the hot list, we keep any
news whose title/snippet contains a keyword from one of the persona's
categories.

Why hardcoded instead of LLM-extracted:
  LLM-generated keywords are unreliable (especially for deepseek reasoning
  models). Hardcoded library is deterministic, fast, and curated by humans.

To extend: add new categories below, then map personas in PERSONA_CATEGORIES.
"""

# ── Categories ──────────────────────────────────────────────────
# Each category: flat list of keywords (zh + en, all lowercase).
# Includes BOTH the obvious terms (e.g. "singer") AND edge terms that
# appear in Chinese hot-news titles (e.g. "歌手", "演员", "演唱会").
NEWS_CATEGORIES: dict[str, dict[str, list[str]]] = {
    "entertainment": {
        "_label_en": "Entertainment & celebrities",
        "keywords": [
            # Chinese
            "娱乐", "娱乐圈", "明星", "歌手", "演员", "演员", "演唱会", "专辑",
            "电影", "电视剧", "综艺", "真人秀", "爱豆", "idol", "粉丝", "出道",
            "选秀", "舞台", "mv", "单曲", "专辑", "演唱", "歌手", "歌后", "歌王",
            "天后", "影帝", "影后", "金曲", "金马", "金像", "百花", "华表",
            "提名", "获奖", "票房", "导演", "编剧", "制片", "主演", "配角",
            "韩流", "韩剧", "日剧", "美剧", "港片", "好莱坞", "迪士尼", "漫威",
            "韩红", "周杰伦", "蔡依林", "林俊杰", "张学友", "刘德华", "王嘉尔",
            "王俊凯", "宋雨琦", "杨紫", "白鹿", "孟子义", "迪丽热巴", "杨幂",
            "赵丽颖", "肖战", "王一博", "易烊千玺", "虞书欣", "鞠婧祎",
            "宋祖儿", "李金铭", "孟子", "丁禹兮", "向佐", "向佑", "陈学冬",
            "李昀锐", "李毅", "功夫", "女足", "片长", "剧组", "演员", "艺人",
            # English
            "celebrity", "singer", "actor", "actress", "concert", "album",
            "movie", "film", "TV show", "television", "idol", "fan", "fans",
            "k-pop", "kpop", "mandopop", "cantopop", "hollywood", "bollywood",
            "music", "band", "vocal", "stage", "debut", "audition", "concert",
            "director", "screenwriter", "oscar", "grammy", "emmy", "box office",
            "marvel", "disney", "netflix", "spotify",
        ],
    },
    "tech": {
        "_label_en": "Technology & software",
        "keywords": [
            # Chinese
            "科技", "ai", "人工智能", "大模型", "llm", "模型", "算法", "开源",
            "芯片", "半导体", "gpu", "cpu", "5g", "6g", "互联网", "云", "云计算",
            "大数据", "区块链", "元宇宙", "vr", "ar", "mr", "xr",
            "操作系统", "windows", "macos", "linux", "ubuntu", "鸿蒙", "安卓", "android",
            "ios", "苹果", "iphone", "ipad", "mac", "macbook",
            "华为", "小米", "oppo", "vivo", "荣耀", "一加", "三星", "samsung",
            "steam", "epic", "playstation", "xbox", "switch", "任天堂", "索尼",
            "字节", "跳动", "bytedance", "seedance", "字节跳动", "火山引擎",
            "豆包", "deepseek", "kimi", "通义", "文心", "智谱", "百川",
            "百度", "阿里", "腾讯", "京东", "美团", "拼多多", "滴滴", "快手",
            "b站", "知乎", "小红书", "微博", "微信",
            "服务器", "数据库", "sql", "nosql", "redis", "kafka",
            "rust", "python", "javascript", "typescript", "go", "java", "c++",
            "github", "gitlab", "docker", "kubernetes", "k8s",
            # English
            "tech", "technology", "ai", "artificial intelligence", "machine learning",
            "deep learning", "neural", "model", "llm", "gpt", "chatgpt", "claude",
            "gemini", "open source", "open-source", "github", "kernel", "iso",
            "chip", "semiconductor", "nvidia", "amd", "intel", "arm", "tsmc",
            "smartphone", "laptop", "hardware", "software", "algorithm",
            "startup", "launch", "demo", "founder", "yc", "series a",
            "vulnerability", "exploit", "zero-day", "cve", "ransomware",
            "hacker", "hackernews", "hn", "producthunt",
            "show hn", "ask hn", "launch hn",
            "futo", "swift", "nixos", "ocr", "ssd", "nvme",
        ],
    },
    "finance": {
        "_label_en": "Finance & economy",
        "keywords": [
            # Chinese
            "财经", "金融", "经济", "商业", "生意", "公司", "集团", "上市",
            "股价", "市值", "估值", "投资", "融资", "基金", "私募", "风投",
            "银行", "贷款", "利率", "汇率", "通货膨胀", "cpi", "ppi", "gdp",
            "财报", "季报", "年报", "营收", "利润", "亏损", "净利",
            "并购", "收购", "重组", "破产", "退市", "ipo",
            "楼市", "房价", "房地产", "地产", "学区房", "限购", "限贷",
            "信托", "保险", "证券", "期货", "外汇", "黄金", "白银",
            "股市", "a股", "港股", "美股", "纳斯达克", "道琼斯", "标普",
            "比特币", "以太坊", "加密货币", "稳定币", "defi",
            "腾讯市值", "阿里", "蚂蚁", "京东", "美团", "拼多多",
            "沪指", "深指", "创业板", "科创板", "北交所",
            # English
            "finance", "financial", "economy", "stock", "share", "market cap",
            "valuation", "investment", "IPO", "fund", "hedge fund", "VC",
            "venture capital", "private equity", "bank", "loan", "credit",
            "interest rate", "exchange rate", "inflation", "CPI", "PPI", "GDP",
            "earnings", "revenue", "profit", "loss", "merger", "acquisition",
            "M&A", "IPO", "bankruptcy", "delisting",
            "bitcoin", "ethereum", "crypto", "blockchain", "stablecoin",
            "nasdaq", "dow", "s&p", "wall street", "fed", "fomc", "powell",
            "treasury", "bond", "yield",
        ],
    },
    "sports": {
        "_label_en": "Sports",
        "keywords": [
            # Chinese
            "体育", "足球", "篮球", "排球", "网球", "羽毛球", "乒乓球",
            "世界杯", "欧洲杯", "美洲杯", "奥运会", "亚运会", "全运会",
            "cba", "nba", "wnba", "中超", "西甲", "英超", "德甲", "意甲", "法甲",
            "欧冠", "亚冠", "世界杯预选赛",
            "球员", "教练", "裁判", "队长", "守门员", "前锋", "后卫", "中场",
            "进球", "助攻", "射门", "扑救", "点球", "任意球", "红牌", "黄牌",
            "c罗", "梅西", "姆巴佩", "哈兰德", "本泽马", "莫德里奇",
            "葡萄牙", "乌兹别克斯坦", "西班牙", "英格兰", "德国", "法国", "巴西", "阿根廷",
            "葡萄牙", "葡萄牙", "c罗", "世界杯", "射手王",
            "武磊", "姚明", "易建联", "李娜", "刘翔", "苏炳添",
            "高尔夫", "f1", "nascar", "ufc", "拳击", "摔跤", "跆拳道",
            # English
            "sport", "sports", "football", "soccer", "basketball", "tennis",
            "badminton", "ping pong", "volleyball", "baseball", "hockey",
            "world cup", "olympics", "olympic", "fifa", "uefa", "nba", "cba",
            "player", "coach", "referee", "captain", "goalkeeper", "striker",
            "midfielder", "defender", "forward",
            "goal", "assist", "shot", "save", "penalty", "free kick",
            "red card", "yellow card",
            "ronaldo", "messi", "mbappe", "haaland", "benzema", "modric",
            "portugal", "argentina", "brazil", "spain", "england", "germany",
        ],
    },
    "auto": {
        "_label_en": "Automotive",
        "keywords": [
            # Chinese
            "汽车", "新车", "电动车", "新能源车", "新能源汽车", "ev",
            "混动", "插混", "增程", "纯电", "油车", "燃油车",
            "比亚迪", "特斯拉", "tesla", "小鹏", "蔚来", "理想", "li", "理想l",
            "小米yu7", "yu7", "雷军", "小米汽车", "su7",
            "model 3", "model y", "model s", "model x", "cybertruck",
            "续航", "充电", "电池", "刀片电池", "宁德时代", "比亚迪电池",
            "自动驾驶", "智能驾驶", "辅助驾驶", "noa", "城市noa",
            "华为问界", "问界", "智界", "享界", "尊界", "阿维塔",
            "bba", "奔驰", "宝马", "奥迪", "保时捷", "兰博基尼", "法拉利",
            "丰田", "本田", "日产", "现代", "起亚", "马自达",
            "汽车消费", "以旧换新", "购置税", "补贴",
            # English
            "car", "auto", "vehicle", "EV", "electric vehicle", "Tesla",
            "model 3", "model y", "model s", "model x", "cybertruck",
            "BYD", "NIO", "XPeng", "Li Auto", "Xiaomi",
            "battery", "range", "charging", "autopilot", "fsd",
            "BMW", "Mercedes", "Audi", "Porsche", "Lamborghini", "Ferrari",
            "Toyota", "Honda", "Nissan", "Hyundai", "Kia", "Mazda",
        ],
    },
    "science": {
        "_label_en": "Science & research",
        "keywords": [
            # Chinese
            "科学", "科研", "研究", "实验", "论文", "期刊", "nature", "science",
            "物理", "化学", "生物", "医学", "天文", "地理", "数学",
            "诺贝尔奖", "诺奖", "诺贝尔", "图灵奖", "菲尔兹",
            "量子", "量子计算", "量子通信", "量子力学",
            "dna", "rna", "基因", "蛋白", "细胞", "病毒", "细菌", "疫苗",
            "新冠", "流感", "hpv", "hiv", "癌症", "肿瘤", "白血病",
            "医学", "医院", "医生", "护士", "手术", "治疗", "病例", "诊断",
            "探月", "火星", "卫星", "火箭", "空间站", "宇航员", "航天",
            "星系", "行星", "恒星", "黑洞", "宇宙", "外星人",
            "光刻机", "粒子", "对撞机", "核聚变", "核裂变",
            "实验室", "研究所", "大学", "清华", "北大", "复旦", "交大",
            "放射性", "镭", "钋", "居里", "爱因斯坦", "einstein", "curie",
            # English
            "science", "research", "study", "experiment", "paper", "journal",
            "physics", "chemistry", "biology", "medicine", "astronomy", "geology",
            "math", "mathematics",
            "nobel", "nobel prize", "turing award", "fields medal",
            "quantum", "quantum computing", "quantum mechanics",
            "DNA", "RNA", "gene", "protein", "cell", "virus", "bacteria",
            "vaccine", "cancer", "tumor", "leukemia",
            "hospital", "doctor", "nurse", "surgery", "treatment", "diagnosis",
            "moon", "mars", "satellite", "rocket", "space station", "astronaut",
            "galaxy", "planet", "star", "black hole", "universe", "extraterrestrial",
            "particle", "collider", "fusion", "fission",
            "lab", "laboratory", "university", "MIT", "Stanford", "Harvard",
        ],
    },
    "literature": {
        "_label_en": "Literature, history & culture",
        "keywords": [
            # Chinese
            "文学", "诗词", "宋词", "唐诗", "古诗", "古文", "文言",
            "诗人", "词人", "文学家", "作家", "小说", "散文", "诗歌",
            "书法", "国画", "水墨", "山水画", "文人", "墨客",
            "红楼梦", "西游记", "水浒传", "三国演义", "金庸", "古龙",
            "莫言", "余华", "路遥", "陈忠实", "贾平凹", "鲁迅",
            "东坡", "苏东坡", "黄州", "赤壁", "西湖", "黄冈",
            "苏轼", "李白", "杜甫", "王维", "白居易", "李商隐", "辛弃疾", "陆游",
            "李清照", "王安石", "欧阳修", "韩愈", "柳宗元",
            "历史", "古代", "近代", "现代史", "战争", "革命", "解放",
            "故宫", "长城", "兵马俑", "敦煌", "龙门", "云冈",
            "敦煌", "故宫", "国家博物馆", "国博",
            "博物馆", "文物", "考古", "遗址", "墓葬",
            "传统", "文化", "非遗", "戏曲", "京剧", "昆曲", "越剧", "黄梅戏",
            "古琴", "二胡", "笛子", "琵琶",
            "高考", "考生", "学校", "大学", "清华", "北大", "复旦", "交大",
            "中考", "高考", "考研", "留学", "海外", "教育",
            # English
            "literature", "poetry", "poem", "novel", "fiction", "prose", "essay",
            "calligraphy", "painting", "art", "artist", "museum", "gallery",
            "history", "ancient", "modern history", "war", "revolution",
            "palace", "great wall", "ruins", "archaeology", "artifact",
            "tradition", "culture", "heritage", "opera", "drama",
            "school", "university", "college", "student", "exam", "test",
        ],
    },
    "politics": {
        "_label_en": "Politics & geopolitics",
        "keywords": [
            # Chinese
            "政治", "政府", "国家", "总统", "总理", "主席", "首相", "外长",
            "外交", "国际", "联合国", "欧盟", "北约", "世贸",
            "美国", "中国", "俄罗斯", "日本", "韩国", "朝鲜", "台湾",
            "以色列", "巴勒斯坦", "加沙", "乌克兰", "俄罗斯", "伊朗",
            "内塔尼亚胡", "特朗普", "拜登", "普京", "泽连斯基",
            "特朗普", "trump", "biden", "putin", "zelensky", "netanyahu",
            "大选", "选举", "投票", "执政党", "在野党", "议会", "国会",
            "制裁", "关税", "贸易战", "脱钩", "限制",
            "战争", "冲突", "军事", "军队", "核武器", "核弹", "导弹",
            "条约", "协议", "宣言", "峰会", "g7", "g20", "apec", "金砖",
            "政策", "改革", "法案", "宪法", "法院", "最高法",
            "行政令", "政令", "国务院", "白宫", "克里姆林宫",
            "霍尔木兹海峡", "台海", "南海", "东海", "半岛",
            "美国", "特朗普签署", "行政令",
            # English
            "politics", "government", "president", "prime minister", "secretary",
            "diplomacy", "un", "nato", "eu", "wto",
            "USA", "China", "Russia", "Japan", "Korea", "Taiwan",
            "Israel", "Palestine", "Gaza", "Ukraine", "Iran",
            "trump", "biden", "putin", "zelensky", "netanyahu",
            "election", "vote", "ballot", "congress", "parliament", "senate",
            "sanction", "tariff", "trade war", "decoupling",
            "war", "conflict", "military", "nuclear", "missile",
            "treaty", "agreement", "summit", "g7", "g20", "apec", "brics",
            "policy", "reform", "bill", "constitution", "court",
            "executive order", "white house", "kremlin",
        ],
    },
    "food": {
        "_label_en": "Food & dining",
        "keywords": [
            # Chinese
            "美食", "餐厅", "饭店", "菜", "菜系", "川菜", "粤菜", "鲁菜",
            "奶茶", "咖啡", "茶饮", "喜茶", "蜜雪冰城", "星巴克", "瑞幸",
            "火锅", "烧烤", "小龙虾", "烧烤", "麻辣烫", "冒菜",
            "西瓜", "水果", "榴莲", "芒果", "荔枝", "樱桃", "草莓",
            "茅台", "五粮液", "啤酒", "红酒", "白酒", "威士忌", "鸡尾酒",
            "预制菜", "外卖", "堂食", "网红店",
            "米其林", "黑珍珠", "必吃榜",
            "见手青", "菌子", "野生菌", "松茸", "牛肝菌",
            # English
            "food", "restaurant", "dining", "cuisine", "chef",
            "coffee", "tea", "starbucks", "milk tea", "bubble tea",
            "wine", "beer", "whiskey", "cocktail", "liquor",
            "fruit", "watermelon", "mango", "durian", "strawberry",
        ],
    },
    "health_medical": {
        "_label_en": "Health & medicine",
        "keywords": [
            # Chinese
            "健康", "医疗", "医学", "医生", "医院", "病人", "患者", "病例",
            "手术", "治疗", "药物", "药品", "疫苗", "接种",
            "hpv", "新冠", "流感", "癌症", "肿瘤", "白血病", "糖尿病",
            "高血压", "心脏病", "抑郁症", "焦虑症", "失眠", "心理",
            "保健", "养生", "中医", "西医", "中药", "西药",
            "bmj", "柳叶刀", "nejm", "jama", "中华医学",
            "卫生", "疾控", "cdc", "fda", "nmpa",
            # English
            "health", "medical", "medicine", "doctor", "hospital", "patient",
            "surgery", "treatment", "drug", "vaccine", "vaccination",
            "HPV", "COVID", "flu", "cancer", "tumor", "leukemia", "diabetes",
            "hypertension", "heart disease", "depression", "anxiety", "insomnia",
            "wellness", "TCM", "psychology",
            "BMJ", "Lancet", "NEJM", "JAMA", "FDA", "CDC",
        ],
    },
    "society": {
        "_label_en": "Society & lifestyle",
        "keywords": [
            # Chinese
            "社会", "民生", "百姓", "市民", "群众", "公众",
            "彩礼", "相亲", "分手", "结婚", "离婚", "婚礼", "婚外情",
            "高考", "中考", "考研", "考公", "公务员", "事业单位",
            "房价", "房租", "学区房", "房地产",
            "老年人", "养老", "退休", "养老金",
            "孩子", "小孩", "婴儿", "幼儿", "小学", "中学", "大学",
            "女性", "性别", "女权", "me too", "metoo",
            "霸凌", "校园暴力", "网暴", "家暴",
            "流浪猫", "流浪狗", "宠物", "动物", "虐猫", "虐狗",
            "失踪", "拐卖", "案件", "犯罪", "诈骗", "传销",
            "彩礼", "相亲", "婚恋", "婆媳",
            # English
            "society", "lifestyle", "people", "citizen", "public",
            "wedding", "marriage", "divorce", "dating",
            "school", "exam", "test", "student", "teacher", "education",
            "rent", "housing", "real estate",
            "elderly", "pension", "retirement",
            "child", "kid", "baby", "toddler",
            "women", "gender", "feminism", "metoo",
            "bullying", "violence", "abuse",
            "pet", "cat", "dog",
            "missing", "crime", "fraud", "scam",
        ],
    },
}


# ── Persona → categories mapping ───────────────────────────────
# First-match-wins order. If a persona's name appears here, only these
# categories are used. If not in the map, falls back to CATEGORY_AUTO_FALLBACK.
PERSONA_CATEGORIES: dict[str, list[str]] = {
    # Entertainment
    "蔡依林": ["entertainment"],
    "jolin": ["entertainment"],
    "Jolin": ["entertainment"],
    "周杰伦": ["entertainment"],
    "jay chou": ["entertainment"],
    "Jay Chou": ["entertainment"],
    "王俊凯": ["entertainment"],
    "宋雨琦": ["entertainment"],
    "刘德华": ["entertainment"],
    "张学友": ["entertainment"],
    "王嘉尔": ["entertainment"],
    "鹿晗": ["entertainment"],
    "吴亦凡": ["entertainment"],
    "杨幂": ["entertainment"],
    "赵丽颖": ["entertainment"],
    "迪丽热巴": ["entertainment"],
    "肖战": ["entertainment"],
    "王一博": ["entertainment"],
    "李易峰": ["entertainment"],
    "杨紫": ["entertainment"],
    "白鹿": ["entertainment"],
    "金晨": ["entertainment"],
    "虞书欣": ["entertainment"],
    "鞠婧祎": ["entertainment"],
    "赵露思": ["entertainment"],
    "陈学冬": ["entertainment"],

    # Science
    "Albert Einstein": ["science"],
    "爱因斯坦": ["science"],
    "Einstein": ["science"],
    "Marie Curie": ["science"],
    "居里夫人": ["science"],
    "Curie": ["science"],
    "marie curie": ["science"],
    "钱学森": ["science"],
    "邓稼先": ["science"],
    "袁隆平": ["science"],

    # Tech
    "马斯克": ["tech", "auto", "finance"],
    "Elon Musk": ["tech", "auto", "finance"],
    "elon musk": ["tech", "auto", "finance"],
    "黄仁勋": ["tech"],
    "Jensen Huang": ["tech"],
    "jensen huang": ["tech"],
    "雷军": ["tech", "auto"],
    "Lei Jun": ["tech", "auto"],
    "张一鸣": ["tech"],
    "Pony Ma": ["tech"],
    "马化腾": ["tech"],
    "Jack Ma": ["tech"],
    "马云": ["tech", "finance"],

    # Finance / business
    "李嘉诚": ["finance", "society"],
    "巴菲特": ["finance"],
    "Warren Buffett": ["finance"],
    "warren buffett": ["finance"],
    "朱啸虎": ["finance", "tech"],

    # Politics
    "特朗普": ["politics"],
    "Trump": ["politics"],
    "trump": ["politics"],
    "Donald Trump": ["politics"],
    "donald trump": ["politics"],
    "拜登": ["politics"],
    "Biden": ["politics"],
    "biden": ["politics"],
    "内塔尼亚胡": ["politics"],
    "Netanyahu": ["politics"],
    "netanyahu": ["politics"],
    "普京": ["politics"],
    "Putin": ["politics"],
    "putin": ["politics"],
    "金正恩": ["politics"],

    # Literature / history
    "苏轼": ["literature"],
    "苏东坡": ["literature"],
    "李白": ["literature"],
    "杜甫": ["literature"],
    "李清照": ["literature"],
    "陆游": ["literature"],
    "辛弃疾": ["literature"],
    "王维": ["literature"],
    "白居易": ["literature"],
    "韩愈": ["literature"],
    "鲁迅": ["literature"],
    "莫言": ["literature"],
    "余华": ["literature"],
    "金庸": ["literature"],
    "古龙": ["literature"],
    "贾平凹": ["literature"],
    "路遥": ["literature"],
}

# Default categories if persona not in map above
CATEGORY_AUTO_FALLBACK = ["entertainment", "society", "tech", "science"]


def get_categories_for_persona(persona_name: str) -> list[str]:
    """Return the list of category keys for a persona.

    Lookup is case-sensitive first, then case-insensitive.
    Falls back to CATEGORY_AUTO_FALLBACK if not mapped.
    """
    if persona_name in PERSONA_CATEGORIES:
        return PERSONA_CATEGORIES[persona_name]
    lc = persona_name.lower()
    for k, v in PERSONA_CATEGORIES.items():
        if k.lower() == lc:
            return v
    return CATEGORY_AUTO_FALLBACK


def get_keywords_for_categories(categories: list[str]) -> list[str]:
    """Flatten the keyword lists from multiple categories into one deduped list."""
    seen: set[str] = set()
    out: list[str] = []
    for cat in categories:
        kw_list = NEWS_CATEGORIES.get(cat, {}).get("keywords", [])
        for k in kw_list:
            kl = k.lower()
            if kl not in seen:
                seen.add(kl)
                out.append(kl)
    return out


def news_matches_categories(
    news: dict,
    keywords: list[str],
    persona_name: str = "",
) -> bool:
    """Return True if news title/snippet matches any keyword OR persona name."""
    text = (news.get("title", "") + " " + news.get("snippet", news.get("content", ""))).lower()
    if not text.strip():
        return False
    if persona_name and persona_name.lower() in text:
        return True
    for kw in keywords:
        if kw in text:
            return True
    return False