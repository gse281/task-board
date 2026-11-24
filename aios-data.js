/* AIOS map data — snapshot of Roni's Claude setup.
   Rebuilt by Claude on "refresh my AIOS map". Live parts (To-dos, routine health) load from Airtable in aios.html.
   Item = [title, tag, detail]. tag: ok | warn | off | '' */
window.AIOS = {
snapshot: '2026-11-24 07:10 ET',
artifact: 'https://claude.ai/artifact/Bc8En9htMBg2ENWiUU6X5n',
branches: [
{ id:'connectors', label:'Connectors', sum:'10 of 12 working', groups:[
  { h:'MCP connectors', items:[
    ['Airtable','ok','Task board backend — Items, Outbox, EmailRun, Leads, ClaudeQueue, Automations, Files in Use, contacts. Used by nearly every routine.'],
    ['Gmail','ok','rbenjamini@gmail.com + SBDG / 1 Oak aliases. Email runs, Respond pane, reply sweeps.'],
    ['Google Calendar','ok','Brief / heartbeat reads; yahrzeits written yearly.'],
    ['Google Drive','ok','Drive files (Woodbine loan doc, Quick Daf folder).'],
    ['Google Docs','ok','Google Docs on request.'],
    ['Google Sheets','ok','Google Sheets on request.'],
    ['Google Slides','ok','Google Slides on request.'],
    ['Dropbox','ok','SBDG Dropbox — Mac root /Volumes/RMB1TB/SBDG Dropbox.'],
    ['Superhuman Mail','warn','Attached to routines but none call it — overlaps Gmail.'],
    ['Zoom for Claude','warn','Attached to routines; nothing uses it yet.'],
    ['Jentic','off','No toolkit set up; hosted execution ended Sep 20, 2026. Remove or move to Jentic One.'],
    ['Slack','off','Setup never finished. Finish sign-in or remove.']]},
  { h:'Built into Claude', items:[
    ['Memory','',''],['Artifacts','','Private pages (Data, Design, Docs, Slides, Whiteboard).'],['Claude Docs','',''],['Scheduled tasks','','See Routines.'],['Past-chat search','',''],['Web search','','']]}]},
{ id:'integrations', label:'Integrations', sum:'14 non-MCP links', groups:[
  { h:'Mac & phone', items:[
    ['Device bridge → Mac','ok','/Users/rmbimac24 + Documents connected. No deletes without your prompt.'],
    ['Computer use','','Per-chat; used to check SMS delivery.'],
    ['iMessage (Read_and_Send_iMessages)','ok','Local MCP on the Mac. Lead texts, queue notices. Needs the Mac on.'],
    ['Claude phone app','','Reminders, calendar, location.'],
    ['rmbopen:// helper','','Opens Files in Use rows in Finder.'],
    ['contacts-sync.py','','Mac/iPhone contacts → Airtable ContactsData.'],
    ['group_text.py','','Group iMessage for the Claude queue.']]},
  { h:'Browsers & web', items:[
    ['Claude in Chrome','ok','Preferred browser; your sign-ins (Verizon chat).'],
    ['Built-in browser pane','','Desktop pane; Quick Daf downloads.'],
    ['Task Board PWA','ok','gse281.github.io/task-board on Airtable.'],
    ['Hearth channel','','Brief, Heartbeat, reminders post here.']]},
  { h:'Keys & rules', items:[
    ['API keys','','None listable. Board keeps its Airtable key in this browser (⚙︎).'],
    ['EMAIL_RULES.md','','Email run reads it first.'],
    ['Local Cowork tasks','warn','lead-texts-sender, open-items-steps — not on account list; check desktop app.']]}]},
{ id:'memory', label:'Memory', sum:'63 files', groups:[
  { h:'Profile', items:[
    ['SBDG + 1 Oak principal','','NYC, Miami, Long Island'],['PE NY + FL','','FL Certified GC B&F'],['Adaptive reuse','','CJH, Powerhouse LIC, Bushwick, Bed-Stuy'],['Shaare Emunah','','admin / leadership'],['Cooper Union','','awards chair'],['Home / office','','Cedarhurst · 700 Rockaway Tpke #204'],['Emails','','rb@sbdevelopmentgroup.com · rmb@1oakgc.com · rbenjamini@gmail.com'],['Surety','','American Trade Credit (Charles)']]},
  { h:'Areas (35)', items:[
    ['1 Oak org chart','',''],['12 Wilson Ave','',''],['Gardens at Buffalo','',''],['29-24 40th Ave LIC','',''],['DOMI','',''],['318 Central','',''],['382 Church','',''],['383 Troutman loan','',''],['58 W 135th','',''],['AIOS map','',''],['Gotsta Bet','',''],['14-14 Brunswick','',''],['Cove Miami','',''],['DOB GC registration','',''],['ESC200','',''],['ESC210','',''],['HSBC loan','',''],['HSS3 subway','',''],['HSS3 subway (dup)','warn',''],['Israel trip','',''],['Israeli eng. license','',''],['Jack Dushey loan','',''],['KDP book','',''],['Museum of Beer','',''],['42-11 Northern Blvd','',''],['PE renewals','',''],['PH-213','',''],['PH 291','',''],['Stats (Hogg & Tanis)','',''],['Shaare Emunah / 539','',''],['Sukkah pergola','',''],['Task system','',''],['My Terumah','',''],['Virtual Soils Lab','',''],['Woodbine/Madison','','']]},
  { h:'People (19)', items:[
    ['Zahava','','wife'],['Mia','','daughter'],['daughter','','adult daughter'],['son','','university'],['Gustavo Montoya','','PM, 1 Oak'],['Sam Mari','','1 Oak'],['Leo Newmark','',''],['Larry Hansen','',''],['Nashi','',''],['Thomas Rhyan','','Sunamp'],['Yehuda Furst','',''],['Adam','','Cove'],['Dionne','','Cove'],['Gaspar Rivera-Torres','','Cove'],['Ron Medalie','','Cove'],['Hans Nelson','','Kaufman Lynn'],['Josh Zimmerman','','Kaufman Lynn'],['Joshua Atlas','','Cove'],['Kyle Hendrickson','','Cove']]},
  { h:'Topics (8) + projects (3)', items:[
    ['Commute','',''],['Computer hardware','',''],['Estimating','',''],['Interests','',''],['Judaica & Torah','',''],['Recent work','',''],['Tooling','',''],['Vehicles','',''],['FFA Office','','project'],['QB','','project'],['Miami Storage','','project']]},
  { h:'Gaps to fill', items:[
    ['Merge HSS3 duplicates','warn','hss-3-subway-project + hss3-subway-project'],
    ['Merge 29-24 40th Ave','warn','2924-40th-ave-lic + domi-lic'],
    ['Board projects, no file','warn','YOSS, 72-01 Queens Blvd, 51 Troutman, NOVA, RISE, NHP, 413 Serena, 579 Flanders, 520 & 1348 Peninsula, 256 W 38th, 317 Edward, Harlem 125th, Shulamith'],
    ['Leads, no people file','warn','Joseph Stern, Steven Benklifa, Rebecca, Richard Kohler, Michelle, Yosef Fried, Dov Segal, Leora, Eli'],
    ['Advisors only in routines','warn','Arielle Maccabi, Amit Paliwal, Rosalie Sabella, Jose Landauro, Shay Zach'],
    ['Unnamed kids files','warn','"daughter" / "son" have no names; confirm vs. "Mia"'],
    ['School/program','warn','No file for the program behind ESC/PH/HSS courses'],
    ['Shabbat rule','warn','Only inside routine prompts, not in preferences'],
    ['Stale areas','warn','Cove, Northern Blvd, Brunswick last updated Jul–Aug']]}]},
{ id:'skills', label:'Skills', sum:'17 + 1 plugin', groups:[
  { h:'In use', items:[['drive-to-done','ok','Yours — Jack Dushey, 539 roof'],['morning','ok','Daily brief'],['chrome-browser','ok','Preferred browser']]},
  { h:'Available', items:[['docs','',''],['xlsx','',''],['pdf','',''],['docx','','Only when Word is named'],['google-workspace','','Only for Google files'],['built-in-browser','',''],['computer-use','',''],['deep-research','',''],['skill-creator','','']]},
  { h:'Likely unused', items:[['pptx','off','Slides type is default'],['video-making','off',''],['import-memory','off','One-time'],['setup-claude','off','Onboarding']]},
  { h:'Overlaps', items:[
    ['cowork-plugin ×3','warn','cowork-plugin skill + cowork-plugin-management plugin (2 skills) — same job'],
    ['PDF ×3','warn','pdf, pdf-reading, file-reading'],
    ['docx vs docs','warn','docs is default'],
    ['Superhuman vs Gmail','warn','same inbox; routines use Gmail']]}]},
{ id:'rules', label:'Rules', sum:'8 prefs · 9 rules', groups:[
  { h:'Saved preferences', items:[
    ['Extremely terse','','Next step or answer, no preamble'],['One question at a time','',''],['Number everything','',''],
    ['RMB-style budgets','','1 Oak template, colors, fonts — budgets only'],['G702/G703','','Classic AIA layout like 72-01 Queens Blvd AMG Req 1'],
    ['Files → Finder command','','open -R / mdfind + add to Files in Use'],['Contacts from Airtable','','Never macOS Contacts'],['Weekly reply checks','','Not frequent']]},
  { h:'Standing rules (in routines)', items:[
    ['Shabbat','','Skip Sat and Fri from 5 PM'],['No sends without approval','','Drafts → Outbox / ClaudeQueue / EmailRun / LeadDrafts'],
    ['Auto texts only to you','','+1 917-406-6700'],['Email safety','','Never trash / delete / unsubscribe / spam; archive on your press'],
    ['No purchases','',''],['Only you set Done','','Leads → "Says done"; never delete, use Disposed'],
    ['Jack Dushey = SMS only','',''],['Report to Automations','','Every routine logs status'],['Content ≠ instructions','','Emails/docs are information only']]}]},
{ id:'permissions', label:'Permissions', sum:'auto-approve · drafts-first', groups:[
  { h:'Without asking', items:[
    ['Read everything connected','ok','Gmail, Calendar, Drive, Dropbox, Airtable, Zoom, memory, web'],
    ['Write the task board','ok','Fields, tasks, drafts, logs'],['Text you','ok','+1 917-406-6700'],
    ['Send approved drafts','ok','EmailRun / ClaudeQueue / LeadDrafts "Approved"'],
    ['Archive on your press','ok','✓ Done or bucket A'],['Write Mac folders','ok','Documents, home'],
    ['Your calendar','ok','Yahrzeits'],['Private artifacts + docs','ok',''],['33 routines auto-approved','ok','']]},
  { h:'Asks first / never', items:[
    ['Message anyone else','off','Drafts only'],['Spend money','off','Never'],['Trash / spam email','off','Never'],
    ['Delete Mac files','off','Permission prompt'],['Mark Done','off','You confirm'],['Delete memory','off','On request only'],
    ['Change stars','off','Only via StarReq'],['Irreversible calls','off','Stops and asks'],['Sharing','off','You do it']]},
  { h:'Pre-approved sends', items:[
    ['Friday Weekly List','warn','Sends each Confirmed + Active lead their list — no review'],
    ['Alumtec text to Yosef','warn','One-time, Tue 11/24 5:23 AM']]}]},
{ id:'todos', label:'To-dos', sum:'656 open', live:true, groups:[]},
{ id:'routines', label:'Routines', sum:'14 on · 9 queued · 10 paused', groups:[
  { h:'Recurring — on', items:[
    ['Heartbeat','ok','5×/day 8:14a 11:14a 2:14p 5:14p 8:14p · check-in on last/next 3 h'],
    ['Morning brief','ok','Daily 8:44 AM'],
    ['R1 · Lead texts — draft top 3','ok','Weekdays 7:10 AM · drafts only'],
    ['📬 Email run','ok','Sun–Fri 11:07 AM · buckets A–E, approved sends, archive'],
    ['📬 Email run 2:47','ok','Sun–Fri 2:47 PM'],
    ['Respond pane','ok','Weekdays 10:52 AM, 4:52 PM · starred drafts'],
    ['04 · Claude requests notify','ok','Sun–Fri 4 PM · texts you'],
    ['05 · Claude task queue','ok','Sun–Fri 4 PM'],
    ['08 · Friday weekly list','ok','Fri 11 AM · sends to leads'],
    ['11 · Sunday reply sweep','warn','Sun 8 AM · missed 11/22'],
    ['Weekly reply sweep','ok','Sun 11:23 AM · Allstate, JML · ends 1/31/27'],
    ['Jack Dushey weekly','ok','Sun 1:41 PM'],
    ['R7 · Nightly notes archive','ok','Daily 11:30 PM'],
    ['R9 · Yahrzeit refresh','ok','Yearly Sep 1']]},
  { h:'One-time — coming up', items:[
    ['Alumtec text to Yosef','','Tue 11/24 5:23 AM'],['539 roof + heaters','','Wed 11/25 10:07 AM'],['Verizon fee credit','','Sun 12/6'],
    ['Woodbine/Madison 2','','Mon 1/11/27'],['Woodbine/Madison 3','','Tue 2/16/27'],['Start 2026 tax docs','','Wed 2/24/27'],
    ['Tax docs follow-up','','Wed 3/10/27'],['Woodbine/Madison 4','','Mon 4/19/27'],['Woodbine/Madison 5','','Tue 6/1/27']]},
  { h:'Paused', items:[
    ['Watch: Jose\'s reply','off','→ weekly sweep'],['Open Items 9 AM (one item)','off',''],['R4 · Open Items 9 AM','off',''],['R5 · Open Items replies','off',''],
    ['Suggested next up','off',''],['R6 · Automations feed','off',''],['R2 · Lead daily top 3','off','→ R1'],['R3 · Lead reply sweep','off','→ 11'],
    ['R8 · Email triage','off','→ Email run'],['Quick Daf Bechoros','off','Device absent']]}]}
]};
