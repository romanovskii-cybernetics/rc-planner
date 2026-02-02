window.h = (elem, ...args) => {
  if (args.length === 0) {
    return preact.h(elem, null)
  }
  if (typeof args[0] === 'object' && args[0].constructor === Object) {
    return preact.h(elem, args[0], args.slice(1))
  } else {
    return preact.h(elem, null, args)
  }
}

const date = (value, addDays = 0) => {
  const curr = new Date(value || Date.now()).getTime()
  const next = new Date(curr + addDays * 1000 * 60 * 60 * 24)
  return next.toLocaleDateString('en-CA')
}

const calculateTotalDuration = (task, daysOff, startDate) => {
  if (task.starts !== undefined)
    return task.starts + (task.calendarDuration || 0)
  let starts = 0
  for (const t of task.prev) {
    const startsNew = calculateTotalDuration(t, daysOff, startDate)
    if (startsNew > starts) starts = startsNew
  }
  task.starts = starts
  while (daysOff.includes(date(startDate, task.starts))) {
    task.starts += 1
  }
  if (task.type === 'task') {
    task.daysOff = 0
    task.calendarDuration = task.duration
    for (let i = 0; i < task.calendarDuration; i++) {
      if (daysOff.includes(date(startDate, task.starts + i))) {
        task.daysOff += 1
        task.calendarDuration += 1
      }
    }
    return task.starts + (task.calendarDuration || 0)
  } else {
    return task.starts
  }
}

const layoutPlan = (tasks, daysOff, startDate) => {
  const plan = { totalDuration: 0 }
  for (const terminatingTask of tasks) {
    const dur = calculateTotalDuration(terminatingTask, daysOff, startDate)
    if (dur > plan.totalDuration) plan.totalDuration = dur
  }
  return plan
}

const Plan = ({ planName, em }) => {

  const [rawPlan, setRawPlan] = preact.useState('')
  const [daysOff, setDaysOff] = preact.useState([])
  const [error, setError] = preact.useState(null)
  const [today, setToday] = preact.useState(date())

  const dayOff = (d, add) => daysOff.includes(date(d, add))

  preact.useEffect(() => {
    fetch('days-off.json')
      .then(v => v.json())
      .then(setDaysOff)
      .catch(setError)
    fetch(planName)
      .then(v => v.text())
      .then(v => setRawPlan(v + '\n')) // add new line if missing
      .catch(setError)
  }, [planName])

  let startDate = today //new Date('2025-09-24').getTime()

  preact.useEffect(() => {
    setTimeout(() => setToday(date()), 1000)
  }, [today])

  const lines = rawPlan.split(/\n/g)
  const groups = []
  const tasks = []
  const waypoints = {}
  const project = {
    groups,
    tasks,
    waypoints
  }

  let currGroup
  let prevTaskOrWaypoint
  const terminatingTasks = []

  const clearPrev = () => {
    if (prevTaskOrWaypoint)
      terminatingTasks.push(prevTaskOrWaypoint)
    prevTaskOrWaypoint = null
  }

  for (const line of lines) {
    if (line.startsWith('[')) {
      // group
      clearPrev()
      const group = {
        name: line.replace(/[\[\]]/g, '').trim(),
        children: []
      }
      groups.push(group)
      currGroup = group
    } else if (line.startsWith('---')) {
      // waypoint
      let name = line.slice(3).trim()
      let starts = undefined

      if (name.match(/^\d\d\d\d-\d\d-\d\d /)) {
        const forceStartsMs = new Date(name.slice(0,10))
        const startDateMs = new Date(startDate)
        starts = Math.round((forceStartsMs - startDateMs) / (1000 * 60 * 60 * 24))
        name = name.slice(11)
      }

      if (!waypoints[name]) {
        waypoints[name] = {
          type: 'waypoint',
          name,
          starts,
          prev: [],
          next: [],
        }
      }
      const waypoint = waypoints[name]
      if (prevTaskOrWaypoint) waypoint.prev.push(prevTaskOrWaypoint)
      prevTaskOrWaypoint = waypoint
    } else if (line.match(/^_?\d+/)) {
      // task
      const query = line.split(' ', 1)[0]
      const name = line.slice(query.length).trim()
      const duration = +query.replace(/[^\d]*(\d+)[^\d]*/, '$1')
      const appendType = line[query.length-1]
      const task = {
        type: 'task',
        name,
        query,
        duration,
        appendType,
        starts: undefined,
        next: [],
        prev: []
      }
      if (prevTaskOrWaypoint) {
        if (appendType === ':')
          task.prev.push(prevTaskOrWaypoint)
        else if (appendType === '|' && prevTaskOrWaypoint.prev[0]) {
          console.log(prevTaskOrWaypoint.prev[0], task.prev)
          task.prev.push(prevTaskOrWaypoint.prev[0])
          //task.prev.push(prevTaskOrWaypoint.prev[0])
        }
      }
      tasks.push(task)
      prevTaskOrWaypoint = task
    } else if (line === '') {
      // empty line, switch task context
      clearPrev()
    } else if (line.startsWith('///')) {
      // comment, ignore
    } else if (line.startsWith('>>> ')) {
      // start date
      startDate = line.slice(4)
    }
  }

  const plan = layoutPlan(tasks, daysOff, startDate)

  console.log(plan, tasks)

  for (const k in waypoints) {
    const waypoint = waypoints[k]
    while (dayOff(startDate, waypoint.starts)) {
      waypoint.starts += 1
    }
    waypoint.dateOf = date(startDate, waypoint.starts)
  }

  const day = (d, add, task = false, ...children) => {
    const taskDate = date(d, add)
    const waypoint = Object.values(waypoints).find(v => v.dateOf === taskDate)
    return h('td', { key: taskDate, title: taskDate, class: 'day ' + (waypoint ? 'waypoint ' : '') + (taskDate === today ? 'today ' : '') + (dayOff(taskDate) ? (task ? 'day-off-task' : 'day-off') : (task ? 'day-work' : '')) }, ...children)
  }

  preact.useEffect(() => {
    document.querySelector('.day.today')?.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'center'
    })
  })

  return [
    h('div', { class: 'outer' }, [

      h('table', { class: 'plantable', style: `position:absolute;backdrop-filter:blur(5px);z-index:1;` }, [
        h('tbody', {}, [
          h('tr', {}, h('td', { style: `color:transparent`, title:'0000-00-00' })),
          Object.values(waypoints).map((task, i) => h('tr', [
            h('td', {}, task.name),
          ])),
          !waypoints.length ? null : h('tr', new Array(1).fill(0).map((v, i) => day(startDate, +i))),
          tasks.map((task, i) => h('tr', [
            h('td', {}, task.name),
          ])),
        ])
      ]),

      h('table', { class: 'plantable', style: `--day-width:${em}rem` }, [
        h('tbody', {}, [
          h('tr', {}, [
            h('td', {}, ''),
            new Array(plan.totalDuration).fill(0).map((v, i) => day(startDate, i, false)),
          ]),
          Object.values(waypoints).map((task, i) => h('tr', [
            h('td', { style: 'color:transparent' }, task.name),
            new Array(task.starts).fill(0).map((v, i) => day(startDate, +i)),
            day(startDate, task.starts, true, task.name),
            //new Array(plan.totalDuration - task.starts).fill(0).map((v, i) => day(startDate, task.starts + i)),
            new Array(Math.max(plan.totalDuration - task.starts - 1, 0)).fill(0).map((v, i) => day(startDate, task.starts + i + 1)),
          ])),
          !waypoints.length ? null : h('tr', new Array(plan.totalDuration + 1).fill(0).map((v, i) => day(startDate, +i - 1))), // empty line
          tasks.map((task, i) => h('tr', [
            h('td', { style: '' }, task.name),
            new Array(task.starts).fill(0).map((v, i) => day(startDate, +i)),
            new Array(task.calendarDuration).fill(0).map((v, i) => day(startDate, task.starts + i, true)),
            console.log(plan.totalDuration - task.starts - task.calendarDuration, plan.totalDuration, task.starts, task.calendarDuration, task.name),
            new Array(plan.totalDuration - task.starts - task.calendarDuration).fill(0).map((v, i) => day(startDate, task.starts + task.calendarDuration + i)),
          ])),
        ])
      ]),
    ]),
    h('pre', rawPlan),
  ]
}

const App = () => {
  const [plans, setPlans] = preact.useState([])
  const [planSelected, setPlanSelected] = preact.useState('')
  const [em, setEm] = preact.useState(1)

  preact.useEffect(() => {
    fetch('/api/plans/list')
      .then(v => v.text())
      .then(v => v.split('\n') || [])
      .then(plans => {
        setPlans(plans)
        if (!planSelected && plans.length)
          setPlanSelected(plans[0])
      })
  }, [])

  return [
    h('div',{class:'bar', style:'margin-bottom:1rem'},
      h('div',
        h('select', { onchange: e => setPlanSelected(e.target.value) }, plans.map(plan =>
          h('option', { value: plan }, plan)
        )),
      ),
      h('input', { type: 'range', value: em, min: 0.1, max: 5, step: 0.01, oninput: e => setEm(e.target.value) }),
      h('div',{style:'flex:1'}),
      h('button',{onclick(){document.documentElement.classList.toggle('dark')}}, '🌗'),
      h('button',{onclick(){document.documentElement.requestFullscreen()}}, '⛶'),
    ),
    planSelected
      ? h(Plan, { planName: `/plans/${planSelected}`, em })
      : h('pre', 'Select a plan to view',{onclick(){document.documentElement.requestFullscreen()}})
  ]
}



preact.render(h(App), document.querySelector('#app'))

document.documentElement.className = 'dark'