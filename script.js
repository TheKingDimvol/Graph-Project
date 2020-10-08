let viz
let driver
let username, password
let updateHandler
let selectorsID = ["relationshipEnd", "relationshipStart",
    "nodeSelect", "oneWayFilterSelector", "depthFilterSelector"]
let serverUrl = "bolt://localhost:11007"
let initialCypher = "MATCH (a) , ()-[r]-() RETURN a, r"

function getGraphInfo() {
    getLoginInfo()
    neo4jLogin()
    updateMenu()
    draw()
    updateHandler = new vizUpdateHandler(initialCypher, viz)
}

function clearFilters() {
    viz.renderWithCypher(initialCypher)
}

function addOneWayFilter() {
    viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*]->()  RETURN p")
}

function showOneWayFilter() {
    viz.renderWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*]->()  RETURN p")
}

function addDepthFilter() {
    let depth = parseInt(document.getElementById("depth").value)
    if (isNaN(depth)) {
        alert("Глубина должна быть указана целым числом больше нуля")
        return
    }

    for (let i = depth; i >= 0; i--){
        viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("depthFilterSelector").value
            + "})-[:subsection*" + i + "]-()  RETURN p")
    }
}

function showDepthFilter() {
    let depth = parseInt(document.getElementById("depth").value)
    if (isNaN(depth)) {
        alert("Глубина должна быть указана целым числом больше нуля")
        return
    }
    viz.clearNetwork()
    for (let i = depth; i >= 0; i--){
        viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("depthFilterSelector").value
            + "})-[:subsection*" + i + "]-()  RETURN p")
    }
}

function searchNodeByName() {
    let input = document.getElementById("nodeSearch").value.toLowerCase().trim()
    let list = document.getElementById("dropDownUL")
    while (list.hasChildNodes()) {
        list.removeChild(list.firstChild);
    }
    if (input === ""){return}

    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].text.toLowerCase().indexOf(input) >= 0){
            console.log(input + " : " + nodeSelector.options[i].text.toLowerCase())
            let li = document.createElement("li")
            li.value = nodeSelector.options[i].value
            li.onclick = (event) => {
                let selectedNodeId = event.target.closest("li").value
                let nodeSelector = document.getElementById("nodeSelect")
                for (let i = 0; i < nodeSelector.options.length; i++){
                    if (nodeSelector.options[i].value == selectedNodeId){
                        nodeSelector.selectedIndex = i
                        getSelectedNodeInfo()
                        return
                    }
                }
            }

            let a = document.createElement("a")
            a.text = nodeSelector.options[i].text

            li.appendChild(a)
            list.appendChild(li)
        }
    }
}

function draw() {
    let config = {
        container_id: "viz",
        server_url: serverUrl,
        server_user: username,
        server_password: password,
        labels: {
            "Node": {
                "caption": "title",
                "size": "size",
                "community": "type",
                "title_properties": [
                    "title",
                    "description",
                    "use",
                    "id"
                ],
            },
        },
        relationships: {
            "subsection": {
                "caption": false,
                "title_properties": false
            },
        },
        arrows: true,
        initial_cypher: initialCypher
    }

    viz = new NeoVis.default(config)
    console.log(viz)
    viz.render()
}

async function neo4jLogin() {
    driver = neo4j.driver(serverUrl, neo4j.auth.basic(username, password), {encrypted: 'ENCRYPTION_OFF'})
    driver.onError = error => {
        console.log(error)
    }

    try {
        await driver.verifyConnectivity()
    } catch (error) {
        alert("Ошибка аутентификации")
    }
    session = driver.session()
}

function getLoginInfo() {
    const menu = document.forms.graphMenu
    serverUrl = document.getElementById("url").value
    username = menu.elements.username.value
    password = menu.elements.password.value
}

function addNode() {
    let availableId
    var idSession = driver.session()
    idSession
        .run("MATCH (p) RETURN p.id ORDER BY p.id DESC LIMIT 1")
        .then(result => {
            result.records.forEach(record => {
                availableId = 1 + parseInt(record.get("p.id"))
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            idSession.close()
        })
        .then(() => {
            var createSession = driver.session()
            createSession
                .run("CREATE (a" + availableId + ":Node {title: \"" + document.getElementById("title").value +
                    "\", description:\"" + document.getElementById("desc").value +
                    "\", use: [\" " + document.getElementById("use").value.split(",").join("\" , \"") + " \"], id:" + availableId + ", size:" + document.getElementById("type").value + "})")
                .then(result => {
                })
                .catch(error => {
                    console.log(error)
                })
                .then(() => {
                    createSession.close()
                    viz.updateWithCypher("MATCH p = ({id:" + availableId + "}) RETURN p")
                    updateMenu()
                })
        })
        .then(() => {updateMenu()})
}

function changeNode() {
    var setSession = driver.session()
    setSession
        .run(
            "MATCH (p:Node {id:" + document.getElementById("nodeSelect").value + "})" +
            " SET p.title = \"" + document.getElementById("title").value + "\"" +
            " SET p.description = \"" + document.getElementById("desc").value + "\"" +
            " SET p.use = [\"" + document.getElementById("use").value.split(",").join("\" , \"") + "\"]" +
            " SET p.size = " + document.getElementById("type").value
        )
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            setSession.close()
            //viz.reload()
            viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("nodeSelect").value + "}) RETURN p")
            updateMenu()
        })
}

function removeNode() {
    var session = driver.session()
    session
        .run("MATCH (p) WHERE p.id =" + document.getElementById("nodeSelect").value + " DETACH DELETE p")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            viz.reload()
            updateMenu()
        })
}

function updateMenu() {
    for (let i = 0; i < selectorsID.length; i++)
        clearSelect(selectorsID[i])
    getNodes()
}

function clearSelect(selectID) {
    for (let i = document.getElementById(selectID).options.length - 1; i >= 0; i--)
        document.getElementById(selectID).options[i] = null
}

function addRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    console.log("MATCH (a:Node) , (b:Node) WHERE a.id = " + startNodeId + "  AND b.id = " + endNodeId + "  CREATE (a)-[:subsection]->(b)")
    var session = driver.session()
    session
        .run("MATCH (a:Node) , (b:Node) WHERE a.id = " + startNodeId + "  AND b.id = " + endNodeId + "  CREATE (a)-[:subsection]->(b)")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            viz.updateWithCypher("MATCH p = ({id:" + startNodeId + "})-[r]->({id:" + endNodeId + "}) RETURN p")
        })

}

function removeRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    var session = driver.session()
    session
        .run("MATCH (a:Node {id:" + startNodeId + "})-[r:subsection]->(b:Node {id:" + endNodeId + "}) DELETE r")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            viz.reload()
        })
}

function getNodes() {
    var session = driver.session()
    session
        .run("MATCH (p:Node) RETURN p.id, p.title")
        .then(result => {
            result.records.forEach(record => {
                let text = "<" + record.get("p.id") + ">:" + record.get("p.title")
                for (let i = 0; i < selectorsID.length; i++)
                    document.getElementById(selectorsID[i]).add(new Option(text, record.get("p.id"), false, false))
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            getSelectedNodeInfo()
        })
}

function getSelectedNodeInfo() {
    var session = driver.session()
    let id = document.getElementById("nodeSelect").value
    session.run("MATCH (p:Node {id: " + id + "}) RETURN p.description, p.use, p.title, p.size LIMIT 1")
        .then(result => {
            result.records.forEach(record => {
                document.getElementById("desc").value = record.get("p.description")
                document.getElementById("title").value = record.get("p.title")
                document.getElementById("use").value = record.get("p.use").join(", ")

                let size = record.get("p.size")
                let sizeOptions = document.getElementById("type").options
                for (let i = 0; i < sizeOptions.length; i++) {
                    if (size == sizeOptions[i].value) {
                        document.getElementById("type").selectedIndex = i
                        break
                    }
                }
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => session.close())
}
