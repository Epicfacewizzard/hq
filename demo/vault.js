// Made-up notes for trying the app. Not real people.
import { iso } from '../js/vault.js';

const d = (offset) => iso(new Date(Date.now() + offset * 86400000));
// birthday that falls `offset` days from today, born in `year`
const bday = (offset, year) => `${year}${d(offset).slice(4)}`;

export const demoFiles = () => ({
  'Home.md': `---
domain: home
type: hub
---
# Home

> [!info] Everything starts here.

- [[Tasks]]
- [[CSS Hub]]
- [[School Hub]]
`,

  'Tasks.md': `---
domain: personal
type: tasks
---
# Tasks

## Personal
- [ ] Book dentist appointment 📅 ${d(-2)}
- [ ] Return library books 📅 ${d(0)}
- [ ] Text Riley about Thanksgiving dinner 📅 ${d(1)}
- [ ] Renew bus pass 📅 ${d(5)}
- [ ] Clean out the fridge
- [x] Laundry ✅ ${d(-1)}

## School
- [ ] NRSG 530 care plan draft 📅 ${d(2)}
- [ ] Read ch. 12 (mood disorders) 📅 ${d(4)}
- [ ] Ask Max about placement hours

## Projects
- [ ] Sketch the HQ app home screen 📅 ${d(0)}
`,

  [`01 Daily/${d(0)}.md`]: `---
domain: daily
type: daily
status: active
updated: ${d(0)}
---
# ${d(0)}

> [!info] Up: [[Home]]

## Jots
- 09:12 Coffee with @Avery after the exec meeting. She's down to run the Mid-Autumn booth.
- 11:40 Idea: lantern-making table at the booth?
- [ ] 13:05 Email the SU about booth space 📅 ${d(1)}

## What happened
- Exec meeting; booth plan started.

Up: [[Home]]
`,

  [`01 Daily/${d(-1)}.md`]: `---
domain: daily
type: daily
status: active
updated: ${d(-1)}
---
# ${d(-1)}

> [!info] Up: [[Home]]

## Jots
- 16:20 Clinical day was long. Good chat with @Jordan about the care plan.
- 21:02 Want to start going to the gym Tue/Thu mornings.

Up: [[Home]]
`,

  [`01 Daily/${d(-3)}.md`]: `---
domain: daily
type: daily
status: active
updated: ${d(-3)}
---
# ${d(-3)}

> [!info] Up: [[Home]]

## Jots
- 12:30 Lunch with @Riley, talked about family trip in December.
- [x] 18:00 Submit reflection ✅ ${d(-3)}

Up: [[Home]]
`,

  '05 People/CSS/Avery Lin.md': `---
aliases: [Ave]
domain: css
type: person
role: VP Events
circle: [CSS, Friends]
closeness: Close
instagram: avery.demo
major: Computer Science
grad_year: 2027
where_we_met: Clubs Week
met_on: 2025-09-10
likes: Taro bubble tea (less sugar), bouldering
dislikes: Early mornings
memory_cues: Always wears a green beanie; cat named Mochi
birthday: ${bday(4, 2005)}
last_talked: ${d(0)}
status: active
---
# Avery Lin

> [!abstract] VP Events

## Notes
- Runs the Mid-Autumn booth this year.

## Log
- ${d(-20)}: Planning call for welcome week.
- ${d(0)}: Coffee after the exec meeting. Down to run the Mid-Autumn booth.

Up: [[PRM]]
`,

  '05 People/Nursing/Jordan Wu.md': `---
aliases: []
domain: school
type: person
role: Clinical group
circle: [Nursing]
closeness: Friendly
major: Nursing
grad_year: 2027
last_talked: ${d(-1)}
follow_up: ${d(2)}
---
# Jordan Wu

> [!abstract] Clinical group

## Log
- ${d(-1)}: Chat about the care plan.

Up: [[PRM]]
`,

  '05 People/Work/Sam Chen.md': `---
aliases: [Sammy]
domain: work
type: person
role: Shift lead
circle: [Work]
closeness: Acquaintance
last_talked: ${d(-70)}
follow_up: ${d(-3)}
---
# Sam Chen

> [!abstract] Shift lead

Up: [[PRM]]
`,

  '05 People/CSS/Taylor Huang.md': `---
aliases: []
domain: css
type: person
role: Marketing
circle: [CSS]
closeness: Friendly
instagram: taylor.makes
last_talked: ${d(-40)}
---
# Taylor Huang

> [!abstract] Marketing

Up: [[PRM]]
`,

  '05 People/Family/Riley Zhang.md': `---
aliases: []
domain: family
type: person
role: Cousin
circle: [Family]
closeness: Close
birthday: ${bday(12, 2003)}
last_talked: ${d(-3)}
---
# Riley Zhang

> [!abstract] Cousin

## Log
- ${d(-3)}: Lunch, talked about the family trip in December.

Up: [[PRM]]
`,

  '05 People/Friends/Casey Li.md': `---
aliases: [CJ]
domain: friends
type: person
role: High school friend
circle: [Friends, Other clubs]
closeness: Friendly
memory_cues: Plays bass in a band; always late
---
# Casey Li

> [!abstract] High school friend

Up: [[PRM]]
`,

  '20 CSS/Events/Mid-Autumn Booth.md': `---
domain: css
type: event
status: planning
---
# Mid-Autumn Booth

> [!info] Up: [[CSS Hub]] · Lead: [[Avery Lin]]

## Plan so far
- Booth in MacHall, mooncake tasting.
- Lantern-making table (idea).

Up: [[CSS Hub]]
`,

  '10 School/NRSG 530.md': `---
domain: school
type: course
---
# NRSG 530

> [!info] Up: [[School Hub]]

Acute mental health placement. Instructor: Max.

## Assignments
- Care plan draft
- Weekly reflections

Up: [[School Hub]]
`,
});
