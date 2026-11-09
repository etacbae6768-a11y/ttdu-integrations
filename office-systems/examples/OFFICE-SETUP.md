# 처리 결과 자동 보관 설정 (사무소용 1쪽)

문서자동처리로 만든 결과(영수증 PDF, 급여 검수표, 가린 고객 서류)를 사무소가 이미 쓰는 프로그램에 바로 넣습니다. 문서관리 Paperless-ngx에는 태그·거래처·문서 종류·작성일이 붙고, Odoo·ERPNext에는 거래처나 직원 기록에 파일이 첨부됩니다.

## 1. 준비 (그 프로그램은 사무소가 따로 설치)
- Paperless-ngx·Odoo·ERPNext·Twenty는 우리 납품물에 들어 있지 않습니다. 사무소가 각 라이선스에 따라 따로 설치하거나 이미 쓰는 것을 그대로 씁니다.
- 주소는 **이 PC 또는 사무실 안(사내망) 주소만** 됩니다. 예: `http://192.168.0.20:8000`. 인터넷 주소는 막혀 있고, 납품본에서는 이 제한을 풀 수 없습니다.

## 2. 설정 3단계
1. 설치 폴더의 `보관연결-설정예시.json` 을 복사해 이름을 `connectors.json` 으로 바꾼 뒤, 쓰는 프로그램의 `url` 을 고칩니다. 안 쓰는 항목은 `"enabled": false` 로 둡니다.
2. 토큰(API 키)을 발급받아 `secrets\` 폴더의 파일에 한 줄로 넣습니다(예: `secrets\paperless.txt`). 이 폴더는 담당자만 열 수 있게 해 두세요(폴더 속성 → 보안).
   - **Paperless-ngx**: 오른쪽 위 사용자 → 내 프로필 → API 토큰(동그란 화살표 버튼).
   - **Odoo 19 이상**: 환경설정 → 계정 보안 → 새 API 키. 기간은 최대 3개월이라 만료 전에 바꿔 넣어야 합니다. 권한을 좁힌 보관 전용 사용자를 권장합니다. Odoo 14~18이면 `"protocol": "jsonrpc"` 와 `"login"`(아이디)을 함께 적습니다.
   - **ERPNext**: 사용자 → 설정 → API 접근 → 키 생성. 파일에는 `api_key:api_secret` 형식으로 한 줄을 적습니다. 주소가 사이트 이름(도메인)이 아니면 `"site": "사이트이름"` 도 적습니다.
   - **Twenty(2.x)**: 설정 → APIs & Webhooks → API 키. 키를 만들 때 역할을 골라야 합니다(회사 읽기와 첨부 만들기가 되는 역할). 1.x 이하 버전은 지원하지 않습니다.
3. `보관연결확인.cmd` 를 실행합니다. 연결마다 `OK` 또는 `FAIL` 과 그 이유가 나옵니다.

## 3. 흐름에 '보관' 단계 넣기
흐름 파일(`flows\*.json`) 맨 끝에 `deliver` 를 추가합니다. 영수증 흐름(A)의 예:
```json
"deliver": [ { "to": "paperless", "only": "pdf", "title": "{client}_{date} 증빙",
               "correspondent": "{client}", "document_type": "증빙", "tags": ["TTDU", "영수증"], "created": "{date}" } ]
```
- Odoo 거래처에 첨부: `{ "to": "odoo", "model": "res.partner", "find": { "name": "{client}" }, "note": "TTDU 처리 결과: {file}" }`
- Odoo 직원에 첨부: `{ "to": "odoo", "model": "hr.employee", "find": { "name": "{employee}" } }`
- ERPNext 거래처에 첨부: `{ "to": "erpnext", "doctype": "Customer", "find": { "customer_name": "{client}" } }`
- Twenty 회사에 첨부: `{ "to": "twenty", "object": "company", "find": { "name": "{client}" } }`
- `{client}`·`{date}` 같은 값은 실행할 때 입력한 값으로 채워집니다. `{file}`·`{stem}`·`{today}` 도 쓸 수 있습니다.

## 4. 이렇게 동작합니다
- 처리는 지금처럼 이 PC 안에서 하고, 처리 도구의 인터넷 차단도 그대로입니다. 끝난 결과 파일만 설정한 주소로 보냅니다.
- 보관에 실패해도 결과 파일은 `결과` 폴더에 그대로 남습니다. 화면 로그에 `보관 … → stored / duplicate / failed` 가 찍힙니다.
- 같은 파일을 다시 보내면 새로 만들지 않고, 이미 있는 문서 번호를 알려 줍니다(duplicate). Twenty는 파일 내용 대신 같은 기록의 같은 이름으로 판단합니다.
- 거래처나 직원 이름이 그 프로그램에 없거나 같은 이름이 둘 이상이면 넣지 않고 알려 줍니다(`not_found` / `ambiguous`). Odoo는 `"create_missing": true` 를 주면 거래처를 새로 만듭니다.
- Paperless-ngx에 엑셀(xlsx)을 넣으려면 Paperless 쪽에 Tika·Gotenberg 설정이 필요합니다. 설정이 없으면 'not supported' 로 실패가 기록되므로, PDF만 보관하려면 `"only": "pdf"` 를 씁니다.

## 5. 문제가 생기면
| 표시 | 뜻 | 할 일 |
|---|---|---|
| `auth_failed` | 토큰·API 키가 틀렸거나 만료됨 | 새로 발급해 secrets 파일에 다시 넣기 |
| `not_found` / `ambiguous` | 그 프로그램에 해당 이름이 없거나 여럿 | 거래처·직원 이름을 맞추거나, `find` 를 더 좁게(예: 사업자번호 칸) |
| `destination_not_allowed` | 사내망이 아닌 주소 | 주소 확인(이 PC·사내망만 가능) |
| `redirect_refused` | 주소가 다른 곳으로 넘겨짐 | http/https, 주소 끝 경로 확인 |
| `timeout` / `ECONNREFUSED` | 그 프로그램이 꺼져 있거나 주소가 틀림 | 프로그램이 켜져 있는지, 주소·포트 확인 |
| `not_configured` | connectors.json 이 없거나 그 연결 이름이 없음 | 2단계 다시 확인 |

## 6. 라이선스·개인정보 고지
- Paperless-ngx(GPL-3.0), Odoo Community(LGPL-3.0), ERPNext(GPL-3.0), Twenty(AGPL-3.0 + Twenty Application Exception)는 각 저작권자의 프로그램입니다. 사무소가 각 라이선스에 따라 따로 설치·운영하며, 상표는 각 권리자의 것입니다.
- 문서자동처리에는 위 프로그램들의 코드가 들어 있지 않습니다. 우리가 드리는 것은 그 프로그램이 공개한 API로 통신하는 연결 부품(`app\integrations\office-systems`, MIT 라이선스)뿐입니다.
- 결과 파일은 이 PC에서 사무소 프로그램으로 바로 갑니다. 저희(행복유통)는 그 파일을 받거나 보관하지 않습니다. 보관 프로그램의 접근 권한과 보관 기간은 사무소의 개인정보 관리 기준을 따라 주세요. 고객 서류는 가리기(C) 흐름 결과만 보관하는 방식을 권합니다.
- Odoo 공식 클라우드(Odoo Online)는 Custom 요금제에서만 외부 API를 쓸 수 있습니다(Odoo 문서). 사무소에 직접 설치한 Odoo에는 이 제한이 없습니다.
