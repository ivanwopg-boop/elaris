def needs_web_search(message: str) -> bool:
    msg_lower = message.lower()
    words = [
        # Time-sensitive
        "latest","recent","recently","now","today","current","currently",
        "this year","this month","this week","these days","right now",
        "just announced","just released","breaking","update on",
        "news","announce","launched","new product","new chip","new model",
        "upgrade","whats new","plan","planning","future","next","upcoming",
        "will you","going to","roadmap","strategy","pipeline",
        "how is the","what is happening",
        "最新","最近","近期","现在","当前","目前","今年","这个月","这周",
        "最近忙","最近在做什么","刚发布","刚宣布","新消息",
        "新发布了","推出","新品","有什么新","新闻",
        "计划","未来","下一步","即将","准备","规划","打算",
        "怎么样了","最近在干嘛","最近忙啥","有什么进展",
        "发布","上市",
        # User correction signals
        "已经发布了","已经出了","早就发布了","你不知道么","你不知道吗",
        "你out了","你落后了","你信息过时了","已经上市了",
        "不对","你说错了","错了","不是这样的","更新一下",
        "不是已经","已经有",
        "that is wrong","you are wrong","not correct",
        "already released","already out","already launched",
        "you do not know","incorrect",
    ]
    return any(w in msg_lower for w in words)