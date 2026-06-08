with open('/opt/elaris/frontend/src/app/group-chat/new/page.tsx', 'r') as f:
    c = f.read()

# Add getLocalizedPresetName import
c = c.replace(
    "import { useLangStore, translations } from '@/lib/i18n';",
    "import { useLangStore, translations, getLocalizedPresetName } from '@/lib/i18n';"
)

# Fix persona name display
c = c.replace(
    '<span className="text-sm font-light text-[#1D1D1F]">{p.name}</span>',
    '<span className="text-sm font-light text-[#1D1D1F]">{getLocalizedPresetName(p.name, lang)}</span>'
)

# Fix all hardcoded strings
replacements = [
    ('Loading...', '{t.loading || "Loading..."}'),
    ('Create Group Chat', '{t.create_group_chat || "Create Group Chat"}'),
    ('Group ChatName', '{t.group_chat_name || "Group Chat Name"}'),
    ('E.g.: Product Brain Trust', '{t.group_chat_placeholder || "E.g.: Product Brain Trust"}'),
    ('No distilled personas', '{t.no_distilled || "No distilled personas"}'),
    ('>Create Persona<', '>{t.create_persona || "Create Persona"}<'),
    ('Role (e.g.: Technical Advisor)', '{t.role_placeholder || "Role (e.g.: Technical Advisor)"}'),
]

for old, new in replacements:
    c = c.replace(old, new)

# Fix Select Personas
c = c.replace(
    'Select Personas <span',
    '{t.select_personas || "Select Personas"} <span'
)

# Fix at least 1
c = c.replace(
    '(at least 1)',
    '{t.at_least_one || "(at least 1)"}'
)

with open('/opt/elaris/frontend/src/app/group-chat/new/page.tsx', 'w') as f:
    f.write(c)
print('Fixed')