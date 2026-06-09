# === Web Search Trigger Logic ===
# Positive triggers: message contains time-sensitive keywords
# Negative filters: message is asking for opinion, not facts

POSITIVE_TRIGGERS = [
    "latest","recent","recently","today","current","currently",
    "this year","this month","this week","these days","right now",
    "just announced","just released","breaking","update on",
    "news","announcement",
    "最新","最近","近期","今天","现在","当前","目前",
    "今年","这个月","这周","刚刚",
    "刚发布","刚宣布","新消息","新闻",
    "launched","launch","released","release","new product",
    "new chip","new model","upgrade","roadmap","pipeline",
    "发布","上市","推出","新品","上新","新发布了",
    "plan","planning","future","next","upcoming",
    "will you","going to","strategy",
    "计划","规划","未来","下一步","即将","准备","打算",
    "already released","already out","already launched",
    "that is wrong","you are wrong","not correct","incorrect",
    "update your","you don't know",
    "已经发布了","已经出了","早就发布了","已经上市了",
    "不对","你说错了","错了","不是这样的",
    "你不知道么","你不知道吗","你out了","你落后了",
    "你信息过时了","更新一下","不是已经","已经有",
    "what happened","what's going on",
    "how is the","any news",
    "最近忙啥","最近在干嘛","最近在做什么",
    "有什么进展","怎么样了","发生了什么事",
    "最近怎么样",
]

NEGATIVE_FILTERS = [
    "你觉得","你怎么看","你认为","你觉着","在你看来",
    "what do you think","in your opinion","do you think",
    "do you believe","how do you feel","how would you",
    "would you rather","do you prefer",
]

def needs_web_search(message: str) -> bool:
    msg_lower = message.lower()
    if not any(w in msg_lower for w in POSITIVE_TRIGGERS):
        return False
    if any(w in msg_lower for w in NEGATIVE_FILTERS):
        return False
    return True
