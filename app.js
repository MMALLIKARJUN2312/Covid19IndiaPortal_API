const express = require('express')
const app = express()
app.use(express.json())

const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error : ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//Authentication with Token :

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  //Scenario 1:
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        //Scenario 2:
        request.username = payload.username
        next()
      }
    })
  }
}

//Login API :

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
  SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)

  //Scenario 1:
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    //Scenario 2 :
    isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      //Scenario 3 :
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    }
  }
})

//Get States API :

const convertDbObjectToStatesObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT * FROM state;`
  const statesArray = await db.all(getStatesQuery)
  response.send(
    statesArray.map(eachState => convertDbObjectToStatesObject(eachState)),
  )
})

//Get State API :

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT * FROM state 
    WHERE state_id = ${stateId}`
  const state = await db.get(getStateQuery)
  response.send(convertDbObjectToStatesObject(state))
})

const convertDbObjectToDistrictsObject = dbObject => {
  return {
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

//Post district API :

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
    INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
    VALUES('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths})`
  const district = await db.run(postDistrictQuery)
  response.send('District Successfully Added')
})

//Get District API :

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT * FROM district WHERE district_id = ${districtId};`
    const eachDistrict = await db.get(getDistrictQuery)
    response.send(convertDbObjectToDistrictsObject(eachDistrict))
  },
)

//Delete District API :

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
    DELETE FROM district WHERE district_id = ${districtId}`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

//Update District API :

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
    UPDATE district 
    SET district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths} 
    WHERE district_id = ${districtId}`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//Get Stats API :

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatsQuery = `
    SELECT sum(cases) AS totalCases,
    sum(cured) AS totalCured,
    sum(active) AS totalActive,
    sum(deaths) AS totalDeaths 
    FROM district 
    WHERE state_id = ${stateId}`
    const totalStats = await db.get(getStatsQuery)
    response.send(totalStats)
  },
)

module.exports = app
