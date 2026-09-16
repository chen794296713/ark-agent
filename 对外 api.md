注册 api:
curl --url 'https://www.iagent.cc/api/auth/register' \ 
  -H 'Accept-Language: zh-CN,zh;q=0.9' \ 
  --data-raw '{"name":"陈振东","email":"zhendongchen2@lightark.ai","password":"lightark@1"}'

 

创建智能体
curl --url 'https://www.iagent.cc/api/agents' \
  -H 'Accept: */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9' \
  --header 'Authorization: Bearer ark_live__lhAru4TtFpAscQicvqcKUM2RJaIh1BH_gmZuw988zY' \
  --data-raw '{"name":"xxx 的招聘助手","roleId":"ocm-31","managerAgentId":31,"engine":"hermes","planTier":"associate","instructions":"","rules":"","channels":[],"tasks":[]}'

响应 
  {
    "agent": {
        "id": "eef9f993-a525-4e0e-a891-4199a4bf9bab",
        "name": "xxx 的招聘助手",
        "mono": "X"
    }
}


---- 聊天

curl --url 'https://www.iagent.cc/api/agents/eef9f993-a525-4e0e-a891-4199a4bf9bab/messages' \
  -H 'Accept-Language: zh-CN,zh;q=0.9' \
  -H 'Cache-Control: no-cache' \ 
  --header 'Authorization: Bearer ark_live__lhAru4TtFpAscQicvqcKUM2RJaIh1BH_gmZuw988zY' \
  --data-raw '{"body":"你好"}'
response：
data: {"type":"delta","delta":"你好！"}
data: {"type":"delta","delta":"有什么"}
data: {"type":"delta","delta":"需要我帮你"}
data: {"type":"delta","delta":"处理的吗？"}
data: {"type":"delta","delta":"你好！有什么需要我帮你处理的吗？"}
data: {"type":"done","conversationId":"0369cd98-ba68-4539-b4dd-df1e7796d383","replyMessage":{"id":"b723e485-8e80-4851-aac0-54cee274967a","sender":"agent","body":"你好！有什么需要我帮你处理的吗？","channelType":"web","status":"delivered","meta":"XXX 的招聘助手 · VIA WEB","createdAt":"2026-09-15T08:14:41.068Z"}}



获取会话列表
curl --url 'https://www.iagent.cc/api/agents/eef9f993-a525-4e0e-a891-4199a4bf9bab/sessions' \
  -H 'Accept: */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9' \ 
  --header 'Authorization: Bearer ark_live__lhAru4TtFpAscQicvqcKUM2RJaIh1BH_gmZuw988zY' 
  response 
  {
    "sessions": [
        {
            "id": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7",
            "key": "agent:main:web:6a8dd0f1-cf2d-43f4-821c-fe756a8342b7",
            "historyId": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7",
            "label": "你好",
            "status": "active",
            "createdAt": "2026-09-15T08:18:24Z",
            "updatedAt": null,
            "preview": "你好",
            "archived": false,
            "pinned": false
        }
    ]
}


获取对话历史：

https://www.iagent.cc/api/agents/eef9f993-a525-4e0e-a891-4199a4bf9bab/sessions/6a8dd0f1-cf2d-43f4-821c-fe756a8342b7/history

response
{
    "sessionId": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7",
    "sessionKey": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7",
    "status": "done",
    "messages": [
        {
            "id": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7-0",
            "sender": "user",
            "body": "你好",
            "channelType": "web",
            "status": "delivered",
            "meta": "YOU",
            "createdAt": "2026-09-15T08:17:15.743Z"
        },
        {
            "id": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7-1",
            "sender": "user",
            "body": "你好",
            "channelType": "web",
            "status": "delivered",
            "meta": "YOU",
            "createdAt": "2026-09-15T08:17:15.743Z"
        },
        {
            "id": "6a8dd0f1-cf2d-43f4-821c-fe756a8342b7-2",
            "sender": "agent",
            "body": "你好！有什么需要我帮你处理的吗？",
            "channelType": "web",
            "status": "delivered",
            "meta": "XXX 的招聘助手 · VIA WEB",
            "createdAt": "2026-09-15T08:17:15.743Z"
        }
    ]
}

微信扫码登录

curl --url 'https://www.iagent.cc/api/channels/wechat/login?instance_uuid=4643e508-b18c-4ab8-ba91-2cc95d966f59' \
  -X 'POST' \
  --header 'Authorization: Bearer ark_live__lhAru4TtFpAscQicvqcKUM2RJaIh1BH_gmZuw988zY' 
  -H 'Accept-Language: zh-CN,zh;q=0.9' \ 
