def needs_web_search(message: str) -> bool:
    words = [
        'latest','recent','recently','now','today','current','currently',
        'this year','this month','this week','these days','right now',
        'just announced','just released','breaking','update on',
        'news','announce','launched','new product','new chip','new model',
        'upgrade','whats new','plan','planning','future','next','upcoming',
        'will you','going to','roadmap','strategy','pipeline',
        '最新','最近','近期','现在','当前','目前','今年',
        '最近忙','最近在做什么','刚发布','刚宣布','新消息',
        '新发布了','推出','新品','有什么新','新闻',
        '计划','未来','下一步','即将','准备','规划','打算',
        '怎么样了','最近在干嘛','最近忙啥','有什么进展',
    ]
    msg_lower = message.lower()
    return any(w in msg_lower for w in words)
