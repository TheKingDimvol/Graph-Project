/**
 *  https://visjs.github.io/vis-network/docs/network/ -- док. по работе на холсте с графом
 */

let viz
let driver
let username, password
let updateHandler
let selectorsID = ["relationshipEnd", "relationshipStart",
    "nodeSelect", "oneWayFilterSelector", "depthFilterSelector"]
let topicsID = ["newTopic", "topic"]
let serverUrl = "neo4j://176.57.217.75:7687"
let initialCypher = "MATCH (a) , ()-[r]-() RETURN a, r"
// будет хранить в реляционной БД
let communities = []
let newPropertysLabelCount = 0
let newPropertysTypeCount = 0
let config
let firstNodeID = -1
let secondNodeID = -1
let vizualHandlersApplyed = false

function getGraphInfo() {
    getLoginInfo()
    neo4jLogin()
    updateMenu()
    draw()
    start()
    updateGraph()
}

function updateGraph(reloadNeeded = false) {
    let session = driver.session()
    session
        .run(initialCypher)
        .then(result => {
            if (result.records.length === 0) {
                console.log("yes")
                viz.updateWithCypher("MATCH (a) RETURN a")
            }
            else
                viz.updateWithCypher(initialCypher)
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            if (reloadNeeded)
                viz.reload()
            setVisEventsHandlers()  // ставим обработчики событий на холсте
            session.close()
        })
}

function start() {
    document.getElementById("Label").add(new Option("Новый тип"))
    document.getElementById("Type").add(new Option("Новый тип"))
    fillingSelect("Label", "MATCH (n) RETURN distinct labels(n)", "labels(n)")
    fillingSelect("Type", "MATCH (a)-[r]->(b) RETURN distinct(type(r))", "(type(r))")
    templateChanged(true, 'Label')
    templateChanged(true, 'Type')    
}

function fillingSelect(select, cypherCode, captionOfResult) {
    let templateSession = driver.session()
    templateSession
        .run(cypherCode)
        .then(result => {
            for(let template of result.records) {
                let captionOfTemplate = template.get(captionOfResult)
                document.getElementById(select).add(new Option(captionOfTemplate))
                if(select === "Label") {
                    config.labels[captionOfTemplate] = {
                        caption: "title",
                        size: "size",
                        community: "community",
                        //image: 'https://visjs.org/images/visjs_logo.png'
                    }
                    /*config.labels["Node"] = {  // если индивидуально под вершину
                        caption: "title",
                        size: "size",
                        community: "topicNumber",
                        image: 'https://visjs.org/images/visjs_logo.png'
                    }*/
                }
            }
        })
        .catch(error => {console.log(error)})
        .then(() => {
            templateSession.close()
        })
}

function templateChanged(isFirstLevel, templateType) {
    document.getElementById("div3" + templateType).innerHTML = ""
    let templatesSelector = document.getElementById(templateType)
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип" && isFirstLevel) {
        document.getElementById("div2" + templateType).innerHTML = ""
        document.getElementById("div1" + templateType).innerHTML = '<label>Имя типа:</label><br>' +
        '<input type="text" id="nameOf' + templateType + '"><br>' +
        '<label>Унаследован от:</label><br>' +
        '<select id="extends' + templateType + '"'
        + '" onChange="templateChanged(false, \'' + templateType + '\')"></select><br>'
        document.getElementById("extends" + templateType).add(new Option("Не унаследован"))
        if(templateType === "Label") {
            fillingSelect("extends" + templateType, "MATCH (n) RETURN distinct labels(n)", "labels(n)")
        }
        else {
            fillingSelect("extends" + templateType, "MATCH (a)-[r]->(b) RETURN distinct(type(r))", "(type(r))")
        }
    }
    else {
        if(isFirstLevel) {
            document.getElementById("div1" + templateType).innerHTML = ""
        }
        document.getElementById("div2" + templateType).innerHTML = ""
        let session = driver.session()
        let extendsTemplatesSelector = document.getElementById("extends" + templateType)
        let nameOfLabel = isFirstLevel ? templatesSelector.options[templatesSelector.selectedIndex].text
        : extendsTemplatesSelector.options[extendsTemplatesSelector.selectedIndex].text
        let cypher = templateType === "Label" ? "MATCH (a:" + nameOfLabel + ") UNWIND keys(a) AS key RETURN distinct key"
        : "match ()-[r:" + nameOfLabel + "]->() Unwind keys(r) AS key return distinct key"
        session
            .run(cypher)
            .then(result => {
                for(let property of result.records) {
                    if(property.get("key") !== "title" && property.get("key") !== "size" 
                        && property.get("key") !== "id" && property.get("key") !== "community") {
                        document.getElementById("div2" + templateType).innerHTML +=
                        '<label>' + property.get("key") + ':</label><br>' +
                        '<input type = "text" id = "' + property.get("key") + '"><br>'
                    }
                }
            })
            .catch(error => {
                console.log(error)
            })
            .then(() => {
                session.close()
            })
    }
    newPropertysLabelCount = 0
    newPropertysTypeCount = 0
}

function addPropertyClick(templateType) {
    let numberOfNewProperty = 0
    let propertys = []
    let propertysValues = []
    let newPropertysCount = templateType === "Label" ? newPropertysLabelCount : newPropertysTypeCount
    while (document.getElementById("property" + templateType + numberOfNewProperty) != null) {
        propertys.push(document.getElementById("property" + templateType + numberOfNewProperty).value)
        propertysValues.push(document.getElementById("property" + templateType + numberOfNewProperty++ + "Value").value)
    }
    document.getElementById("div3" + templateType).innerHTML += '<label>Имя свойства:</label><br>' +
    '<input type = "text" id = "property' + templateType + newPropertysCount + '"<br>' +
    '<br><label>Значение:</label><br>' +
    '<input type = "text" id = "property' + templateType + newPropertysCount++ + 'Value"<br><br>'
    for(let i = 0; i < propertys.length; i++) {
        document.getElementById("property" + templateType + i).value = propertys[i]
        document.getElementById("property" + templateType + i + "Value").value = propertysValues[i]
    }
    if(templateType === "Label") {
        newPropertysLabelCount = newPropertysCount
    }
    else {
        newPropertysTypeCount = newPropertysCount
    }
}

function replacementSpaces(caption) {
    let indexOfSpace
    while ((indexOfSpace = caption.indexOf(" ")) != -1) {
        caption = caption.slice(0, indexOfSpace) + "_" + caption.slice(indexOfSpace + 1)
    }
    return caption
}

function addRelations() {
    if(firstNodeID < 0 || secondNodeID < 0) {
        alert(firstNodeID + "," + secondNodeID)
        return
    }
    let cypher = "match(a) where a.id = " + firstNodeID + " match(b) where b.id = " + secondNodeID + " create (a)-[r:"
    let typeSelect = document.getElementById("Type")
    if(typeSelect.options[typeSelect.selectedIndex].text === "Новый тип") {
        if(document.getElementById("nameOfType") === "") {
            return
        }
        cypher += replacementSpaces(document.getElementById("nameOfType").value)
    }
    else {
        cypher += replacementSpaces(typeSelect.options[typeSelect.selectedIndex].value)
    }
    let propertys = readPropertys("Type")
    let isFirstProperty = propertys === "" ? true : false
    cypher += " {" + propertys + "}]->(b)"
    let session = driver.session()
    session
        .run(cypher)
        .then(() => {})
        .catch((error) => {
            console.log(error)
            alert("Неполучилось создать связь. Возможно вы где-то ввели недопустимый символ")
            alert(cypher)
        })
        .then(() => {
            session.close()
            updateGraph()
            updateMenu()
        })
    newPropertysTypeCount = 0
    templateChanged(isFirstLevel, "Type")
}

function readPropertys(templateType) {
    let cypher = ""
    let startOfIDProperty = 0
    let propertysHTML = document.getElementById("div2" + templateType).innerHTML
    let isFirstProperty = true
    while (true) {
        startOfIDProperty = propertysHTML.indexOf("=", startOfIDProperty)
        if(startOfIDProperty == -1) {
            break
        }
        if(!isFirstProperty) {
            cypher += ","
        }
        startOfIDProperty = propertysHTML.indexOf("=", ++startOfIDProperty)
        startOfIDProperty += 2;
        let endOfIDProperty = startOfIDProperty;
        while(propertysHTML[endOfIDProperty] != '"') {
            endOfIDProperty++;
        }
        let propertyCaption = replacementSpaces(propertysHTML.slice(startOfIDProperty, endOfIDProperty))
        cypher += propertyCaption + ': "' + document.getElementById(propertyCaption).value + '"'
        isFirstProperty = false
    }
    let newPropertyNumber = 0;
    while(document.getElementById("property" + templateType + newPropertyNumber) != null) {
        if(document.getElementById("property" + templateType + newPropertyNumber).value === "") {
            newPropertyNumber++
            continue
        }
        if(!isFirstProperty) {
            cypher += ","
        }
        if(document.getElementById("property" + templateType + newPropertyNumber).value === "") {
            continue
        }
        cypher += replacementSpaces(document.getElementById("property" + templateType + newPropertyNumber).value) + ': "' +
        document.getElementById("property" + templateType + newPropertyNumber++ + "Value").value + '"'
        isFirstProperty = false
    }
    return cypher
}

/** 
 * Считывает название Типа вершины из поля формы. Если это "Новый тип",
 * то для него создается раздел в config.labels. 
 * @return {object} контейнер с названием и сведениями о состоянии
 *   {
       name: название типа, 
 *     isNew: флаг - новый ли,
 *     isFirstLevel: флаг - верхний ли уровень наследования,
 *     error: флаг ошибки
 *    }
 */
function handleTemplateName(){
    let result = {name: "", isNew: false, isFirstLevel: false, error: false}

    let templatesSelector = document.getElementById("Label")
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип") {
        result.isNew = true
        if(document.getElementById("nameOfLabel").value === "") {
            result.error = true
        } else {
            result.isFirstLevel = true
            result.name = replacementSpaces(document.getElementById("nameOfLabel").value)
            document.getElementById("extendsLabel").add(new Option(result.name))        
            templatesSelector.add(new Option(result.name))
            config.labels[result.name] = {
                caption: "title",
                size: "size",
                community: "community"
            }
        } 
    }
    else {
        result.name = templatesSelector.options[templatesSelector.selectedIndex].text
    }
    return result
}

/** Добавляет вершину выбранного типа в граф */
function addNodeByTamplateClick() {
    if(document.getElementById("caption").value === "") {
        return
    }
    templateInfo = handleTemplateName()
    if (templateInfo.error) {
        return
    }
    let session = driver.session()
    session
        .run("MATCH (n:" + templateInfo.name + ") RETURN n.community")
        .then(result => {
            let community = result.records[0].get("n.community")

            let cypher ="MATCH (n) WITH max(n.community) AS last_community, max(n.id) AS last_ID " 
            cypher +="CREATE (a:" + templateInfo.name
            
            // собираем в запрос свойства
            let propertys = readPropertys("Label")
            let isFirstProperty = propertys === "" ? true : false
            cypher += "{" + propertys
            if (!isFirstProperty) {
                cypher += ","
            }
            
            let community_id = templateInfo.isNew ? " last_community+1 " : community

            cypher += ' title: "' + document.getElementById("caption").value + '", '
            cypher += ' id: last_ID+1, '
            cypher += ' community: ' + community_id  + ', '
            let sizeVal = document.getElementById("size")
                                  .options[document.getElementById("size").selectedIndex]
                                  .value
            cypher += ' size:' + sizeVal + '})'
            
            // добавляем в граф вершину с заданным типом и свойствами
            var subSession = driver.session()
            subSession
                .run(cypher)
                .then(() => {})
                .catch(error => {
                    console.log(error)
                    alert("Не получилось добавить вершину. Возможно вы где-то ввели недопустимый символ.")
                    alert(cypher)
                })
                .then(() => {
                    session.close()
                    updateGraph()
                    updateMenu()
                }) 

        })
        .catch(error => {
            console.log(error)
            alert("Ошибка запроса к БД. Не удалось прочитать тип вершины.")            
        })

    newPropertysLabelCount = 0
    templateChanged(templateInfo.isFirstLevel, "Label")
    document.getElementById("caption").value = ""
}

function clickOnULSearch(event, node, UL) {
    let selectedNodeId = event.target.closest("li").value
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].value == selectedNodeId) {
            document.getElementById(node).value = nodeSelector.options[i].text
            clearUL(UL)
            if(node === "firstNode") {
                firstNodeID = selectedNodeId
            }
            else {
                secondNodeID = selectedNodeId
            }
            return
        }
    }
}

function clearUL(UL) {
    let list = document.getElementById(UL)
    while (list.hasChildNodes()) {
        list.removeChild(list.firstChild);
    }
}

//!!! Костыль ([:subsection*0..100]) не показывает деревья с больше чем 100 этажей
function addOneWayFilter() {
    viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*0..100]->()  RETURN p")
}

function showOneWayFilter() {
    viz.renderWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*0..100]->()  RETURN p")
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

function searchNodeByName(inputNode, UL, clickOnULFunction) {
    let input = document.getElementById(inputNode).value.toLowerCase().trim()
    let list = document.getElementById(UL)
    clearUL(UL)
    if (input === ""){return}
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].text.toLowerCase().indexOf(input) >= 0) {
            console.log(input + " : " + nodeSelector.options[i].text.toLowerCase())
            let li = document.createElement("li")
            li.value = nodeSelector.options[i].value
            li.onclick = (event) => clickOnULFunction(event, inputNode, UL)
            let a = document.createElement("a")
            a.text = nodeSelector.options[i].text

            li.appendChild(a)
            list.appendChild(li)
        }
    }
}

function clickOnUL(event) {
    let selectedNodeId = event.target.closest("li").value
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].value == selectedNodeId) {
            nodeSelector.selectedIndex = i
            getSelectedNodeInfo()
            return
        }
    }
}

function draw() {    
    config = {
        container_id: "viz",
        server_url: serverUrl,
        server_user: username,
        server_password: password,
        labels: {  // не влияет на ситуацию - config.labels перезаписывается в других местах 
            "Node": {
                caption: "title",
                size: "size",
                community: "topicNumber"
            }
        }, 
        relationships: {
            "subsection": {
                caption: "type",
                thickness: "thickness",
                title_properties: false
            }
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
}

function getLoginInfo() {
    const menu = document.forms.graphMenu
    serverUrl = document.getElementById("url").value
    username = menu.elements.username.value
    password = menu.elements.password.value
}

function addNode() {
    let availableId = 0
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
            let topic = document.getElementById("newTopic").value
            if (topic === "Создать новую тему") {
                topic = document.getElementById("newTitle").value
                communities.push(topic)
            }
            createSession
                .run("CREATE (a" + availableId + ":Node {title: \"" + document.getElementById("newTitle").value +
                    "\", topic:\"" + topic +
                    "\", topicNumber:" + communities.indexOf(topic) +
                    ", description:\"" + document.getElementById("newDesc").value +
                    "\", use: [\" " + document.getElementById("newUse").value.split(",").join("\" , \"") + 
                    " \"], id:" + availableId + 
                    ", size:" + parseFloat(document.getElementById("newType").value) + "})")
                .then(() => {
                })
                .catch(error => {
                    console.log(error)
                })
                .then(() => {
                    createSession.close()
                    updateGraph()
                    updateMenu()
                })
        })
}

function changeNode() {
    var setSession = driver.session()
    setSession
        .run(
            "MATCH (p:Node {id:" + document.getElementById("nodeSelect").value + "})" +
            " SET p.title = \"" + document.getElementById("title").value + "\"" +
            " SET p.description = \"" + document.getElementById("desc").value + "\"" +
            " SET p.use = [\"" + document.getElementById("use").value.split(",").join("\" , \"") + "\"]" +
            " SET p.size = " + parseFloat(document.getElementById("type").value)
        )
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            setSession.close()
            updateGraph()
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
            updateGraph(true)
            /* вариант удаления по id без обновления всего графа. 
            Проблема из-за несовпадения id на холсте и в БД.
            id = parseInt(document.getElementById("nodeSelect").value)
            viz._network.selectNodes([id])  // выделяем на холсте узел
            viz._network.deleteSelected()   // удаляем его из визуализации
            */
            updateMenu()
        })
}

function updateMenu() {
    for (let i = 0; i < selectorsID.length; i++)
        clearSelect(selectorsID[i])
    for (let i = 0; i < topicsID.length; i++)
        clearSelect(topicsID[i])
    let text = "Создать новую тему"
    document.getElementById("newTitle").value = ""
    document.getElementById("newDesc").value = ""
    document.getElementById("newUse").value = ""
    document.getElementById("newTopic").add(new Option(text, text, false, false))
    getTopics()
    getNodes()
}

function clearSelect(selectID) {
    for (let i = document.getElementById(selectID).options.length - 1; i >= 0; i--)
        document.getElementById(selectID).options[i] = null
}

function addRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    let relationshipType = document.getElementById("relationshipType").value
    var session = driver.session()
    session
        .run(`MATCH (a) , (b) WHERE a.id = ${startNodeId} AND b.id = ${endNodeId}  CREATE (a)-[:subsection {type: "${relationshipType}"}]->(b)`)
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            updateGraph()
        })

}

function removeRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    var session = driver.session()
    session
        .run("MATCH (a {id:" + startNodeId + "})-[r:subsection]->(b {id:" + endNodeId + "}) DELETE r")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            updateGraph(true)
        })
}

function getTopics() {
    var session = driver.session()
    session
        .run("MATCH (p) WHERE p.topic IS NOT NULL RETURN DISTINCT p.topic")
        .then(result => {
            result.records.forEach(record => {
                for (let i = 0; i < topicsID.length; i++)
                    document.getElementById(topicsID[i]).add(new Option("<" + record.get("p.topic") + ">", record.get("p.topic"), false, false))
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
        })
}

function getNodes() {
    var session = driver.session()
    session
        .run("MATCH (p) RETURN p.id, p.title ORDER BY p.id")
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
            var subSession = driver.session()
            subSession
                .run("MATCH (p) RETURN DISTINCT p.topic, p.topicNumber")
                .then(result => {
                    result.records.forEach(record => {
                        communities[record._fields[1]] = (record._fields[0])
                    })
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
    if (id === "") return
    session
        .run("MATCH (p {id: " + id + "}) RETURN p.description, p.use, p.title, p.topic, p.size LIMIT 1")
        .then(result => {
            result.records.forEach(record => {
                document.getElementById("desc").value = record.get("p.description")
                document.getElementById("title").value = record.get("p.title")
                document.getElementById("topic").value = record.get("p.topic")
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

/*=================== Обработка событий ================*/

/**
 * По ID вершины от визуализатора считывает известные ему свойства вершины
 * @param {number} ID вершины на холсте
 * @return {object} объект со свойствами ключ-значение, например {'id':'5', 'use':'IT'}
 */
function getVisualNodeProperties(visualId){
    let props = {}
    // извлечем свойства из поля title вершины (должен быть способ лучше)
    nodePropertiesString = viz._nodes[visualId].title    
    nodePropertiesString.split('<br>').forEach((line, i, arr) => {
        let keyVal = line.replace('<strong>','').replace('</strong>','').split(':')        
        if (keyVal[0].length > 0) {
            props[keyVal[0]] = keyVal[1].trim()
        }
    })
    return props
}


/**
 * Привязывает обработчик к клику по вершине.
 * Кликнутая вершина ставится выбранной в формах c select-ами по вершинам
 */
function setNodeClickHandler(){    
    viz._network.on('click', (param) => {  // по клику на холст
        if (param.nodes.length > 0) {
            nodeIdAtCanvas = param.nodes[0]  // ID вершины на холсте, не совпадает с ID в БД        
            let properties = getVisualNodeProperties(nodeIdAtCanvas)
            realID = parseInt(properties.id)
            if (realID != NaN) {
                // ставим выбранной нужную вершину и симулируем клик по select-ам
                document.getElementById('nodeSelect').value = realID
                document.getElementById('nodeSelect').dispatchEvent(new MouseEvent('change'))

                document.getElementById('relationshipStart').value = realID
                document.getElementById('relationshipStart').dispatchEvent(new MouseEvent('change'))

            }
        }
        
    })
}

/**
 * Ставит обработчики на элементы холста, как только он прорисовался
 * (до этого объект viz._network равен null)
 */
function setVisEventsHandlers(){
    viz.registerOnEvent("completed", (e)=>{
        setNodeClickHandler()             
        //TODO: обработчики на doubleClick, oncontext(правый клик), hold...
    });
}

/*=================== END Обработка событий ================*/

/*

// заметки по сохранению состояния

//считать все координаты всех вершин 
pos = viz._network.getPositions()
// сохраняться в виде в pos={{0:{x:-10, y:15}, {0:{x:154, y:165}, ... }

 
// переместить вершины согласно координатам из объекта pos
for (i=0; i<Object.keys(pos).length; i++) {
    viz._network.moveNode(i, pos[i].x, pos[i].y)
}

НО: если в промежутке между сохранение и чтением кол-во узлов поменяют,
координаты применятся не к тем узлам. Вывод - хранить координаты
индивидуально в узлах
*/