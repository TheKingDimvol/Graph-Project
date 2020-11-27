let viz
let driver
let username, password
let updateHandler
let selectorsID = ["relationshipEnd", "relationshipStart",
    "nodeSelect", "oneWayFilterSelector", "depthFilterSelector"]
let topicsID = ["newTopic", "topic"]
let serverUrl = "bolt://localhost:7687"
let initialCypher = "MATCH (a) , ()-[r]-() RETURN a, r"
// будет хранить в реляционной БД
let communities = []
let newPropertysLabelCount = 0//кол-во добавленных свойств для типа вершины
let newPropertysTypeCount = 0//кол-во добавленных свойств для типа связи
let config//config для neovis
let lastID = -1//id последнего добавленного элемента
let firstNodeID = -1//id первой вершины, которую нужно связать
let secondNodeID = -1//id второй вершины, которую нужно связать

function getGraphInfo() {
    getLoginInfo()
    neo4jLogin()
    updateMenu()
    draw()
    start()
    updateGraph()
}

function updateGraph(templateType = "Label", reloadNeeded = false) {
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
            session.close()
        })
        templateChanged(true, templateType)//обновление fieldset для добавления вершины (Label) или связи (Type)
}

function start() {
    fillingSelect("Label", "MATCH (n) RETURN distinct labels(n)", "labels(n)")//заполнение select для выбора типа вершины
    fillingSelect("Type", "MATCH (a)-[r]->(b) RETURN distinct(type(r))", "(type(r))")//заполнение select для выбора типа связи
    templateChanged(true, 'Type')//обновление fieldset для добавления связи
    let session = driver.session()
    session
        .run("match (a) return a.id order by a.id desc limit 1")//поиск максимального id
        .then(result => {
            lastID = result.records[0].get("a.id")
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => session.close())
}

function fillingSelect(select, cypherCode, captionOfResult) {//заполнение select
    let templateSession = driver.session()
    templateSession
        .run(cypherCode)
        .then(result => {
            for(let template of result.records) {
                let captionOfTemplate = template.get(captionOfResult)
                document.getElementById(select).add(new Option(captionOfTemplate))
                if (select === "Label") {//если заполняется select для выбора типа вершин
                    config.labels[captionOfTemplate] = {//настроить config для отображения вершин
                        caption: "title",
                        size: "size",
                        community: "topicNumber"
                    }
                }
            }
        })
        .catch(error => {console.log(error)})
        .then(() => {
            templateSession.close()
        })
}

function templateChanged(isFirstLevel, templateType) {//срабатывает при изменении выбранного элемента в любом select
    let div1 = `div1${templateType}`
    let div2 = `div2${templateType}`
    let div3 = `div3${templateType}`//id div нужного fieldset
    document.getElementById(div2).innerHTML = ""
    document.getElementById(div3).innerHTML = ""//удаление всех элементов с div2 и div3
    let extendsSelectID = `extends${templateType}`//id для выбора от какого типа наследовать
    let templatesSelector = document.getElementById(templateType)//select для выбора типа связи или вершины
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип" && isFirstLevel) {
        //если изменился элемент в select выбора типа и этот элемент - Новый тип
        document.getElementById(div1).innerHTML = //добавление элементов в div1
        `<label>Имя типа:</label><br>
        <input type="text" id="nameOf${templateType}"><br>
        <label>Унаследован от:</label><br>
        <select id="${extendsSelectID}" onChange="templateChanged(false, '${templateType}')"></select><br>` /*Добавление input для
        ввода имени типа и select для выбора от какого типа унаследован данный тип*/
        document.getElementById(extendsSelectID).add(new Option("Не унаследован"))//добавлении опции "Не унаследован"
        if(templateType === "Label") {//заполнение select типами вершин или связей
            fillingSelect(extendsSelectID, "MATCH (n) RETURN distinct labels(n)", "labels(n)")
        }
        else {
            fillingSelect(extendsSelectID, "MATCH (a)-[r]->(b) RETURN distinct(type(r))", "(type(r))")
        }
    }
    else {//елси выбран тип или тип, от которого нужно наследоваться
        if(isFirstLevel) {//если выбран тип
            document.getElementById(div1).innerHTML = ""//очистка div1
        }
        let extendsTemplatesSelector = document.getElementById(extendsSelectID)//select для выбора от какого типа наследоваться
        let nameOfLabel = isFirstLevel ? templatesSelector.options[templatesSelector.selectedIndex].text
        : extendsTemplatesSelector.options[extendsTemplatesSelector.selectedIndex].text//имя типа любого уровня
        let cypher = (templateType === "Label") ? `MATCH (a:${nameOfLabel}) UNWIND keys(a) AS key RETURN distinct key`
        : `match ()-[r:${nameOfLabel}]->() Unwind keys(r) AS key return distinct key`/*комманда на cypher для поиска всех свойств
        вершин или связей*/
        let session = driver.session()
        session
            .run(cypher)
            .then(result => {
                for(let property of result.records) {
                    if(property.get("key") !== "title" && property.get("key") !== "size" && property.get("key") !== "id") {
                        //если свойство не title, size и id
                        document.getElementById(div2).innerHTML +=
                        `<label>${property.get("key")}:</label><br>
                        <input type = "text" id = "${property.get("key")}"><br>`//добавление input для ввода значения свойства
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
    newPropertysTypeCount = 0//обнуление кол-ва новых добавленных свойств
}

function addPropertyClick(templateType) {//добавление нового свойства для вершины или связи
    let numberOfNewProperty = 0//номер нового свойства
    let propertys = []//массив имен свойств
    let propertysValues = []//массив значений свойств
    let newPropertysCount = (templateType === "Label") ? newPropertysLabelCount : newPropertysTypeCount//кол-во уже добавленных свойств
    while (document.getElementById(`property${templateType}${numberOfNewProperty}`) != null) {//пока есть input для новых свойств
        propertys.push(document.getElementById(`property${templateType}${numberOfNewProperty}`).value)
        propertysValues.push(document.getElementById(`property${templateType}${numberOfNewProperty++}Value`).value)
        //добавление имен свойств и их значений в массивы
    }
    document.getElementById(`div3${templateType}`).innerHTML +=
    `<label>Имя свойства:</label><br>
    <input type = "text" id = "property${templateType}${newPropertysCount}">
    <br><label>Значение:</label><br>
    <input type = "text" id = "property${templateType}${newPropertysCount++}Value"><br>`//добавление input для нового свойства
    for(let i = 0; i < propertys.length; i++) {//заполнение предыдущих input
        propertyInputID = `property${templateType}${i}`
        document.getElementById(propertyInputID).value = propertys[i]
        document.getElementById(`${propertyInputID}Value`).value = propertysValues[i]
    }
    if(templateType === "Label") {//сохранение кол-ва новых элементов
        newPropertysLabelCount = newPropertysCount
    }
    else {
        newPropertysTypeCount = newPropertysCount
    }
}

function replacementSpaces(caption) {//замена пробелов в именах типа и свойств на _ (функция меняет исходную строку)
    let indexOfSpace//index пробела
    while ((indexOfSpace = caption.indexOf(" ")) != -1) {
        caption = `${caption.slice(0, indexOfSpace)}_${caption.slice(indexOfSpace + 1)}`
    }
    return caption
}

function addRelations() {//добавление связи
    if(firstNodeID < 0 || secondNodeID < 0) {//если элементы не выбраны
        return
    }
    let typeSelect = document.getElementById("Type")//select выбора типа связи
    let isFirstLevel = false
    let nameOfTemplate//имя типа
    if(typeSelect.options[typeSelect.selectedIndex].text === "Новый тип") {//если выбран Новый тип
        if(document.getElementById("nameOfType") === "") {//если имя нового типа не введено
            return
        }
        isFirstLevel = true
        nameOfTemplate = replacementSpaces(document.getElementById("nameOfType").value)//имя типа без пробелов
        addOption(nameOfTemplate, "Type")//добавление типа в select
    }
    else {
        nameOfTemplate = replacementSpaces(typeSelect.options[typeSelect.selectedIndex].value)//имя типа из select
    }
    let propertys = readPropertys("Type")//считывание свойств вершин и их значение
    let cypher = `match(a) where a.id = ${firstNodeID} match(b) where b.id = ${secondNodeID}
    create (a)-[r:${nameOfTemplate} {${propertys}}]->(b)`//составление комманды для neo4j
    console.log(cypher)
    let session = driver.session()
    session
        .run(cypher)//добавление вершины
        .then(() => {})
        .catch((error) => {
            console.log(error)
            alert("Неполучилось создать связь. Возможно вы где-то ввели недопустимый символ")
            alert(cypher)
        })
        .then(() => {
            session.close()
            updateGraph("Type")//обновление графа
            updateMenu()
        })
    newPropertysTypeCount = 0
    document.getElementById("firstNode").value = ""
    document.getElementById("secondNode").value = ""
    firstNodeID = -1
    secondNodeID = -1//отчистка input и обнуление полей
}

function readPropertys(templateType) {//считывание свойств в комманду cypher
    let cypher = ""//команда
    let startOfIDProperty = 0//начало имени свойства
    let propertysHTML = document.getElementById(`div2${templateType}`).innerHTML//html div2
    let isFirstProperty = true//первое ли свойство в команде
    while (true) {//поиск имен свойств в div2
        startOfIDProperty = propertysHTML.indexOf("=", startOfIDProperty)
        if(startOfIDProperty == -1) {
            break
        }
        if(!isFirstProperty) {//ставим запятую в команде, если свойство не первое
            cypher += ","
        }
        startOfIDProperty = propertysHTML.indexOf("=", ++startOfIDProperty)//имя свойства написано после второго знака =
        startOfIDProperty += 2;//пропуск пробела и ковычек
        let endOfIDProperty = startOfIDProperty;//индекс последней буквы свойства
        while(propertysHTML[endOfIDProperty] != '"') {
            endOfIDProperty++;
        }
        let propertyCaption = replacementSpaces(propertysHTML.slice(startOfIDProperty, endOfIDProperty))//имя свойства
        cypher += `${propertyCaption}: "${document.getElementById(propertyCaption).value}"`//добавление свойства в команду
        isFirstProperty = false//если цикл прошел - есть свойства
    }
    let newPropertyNumber = 0;//номер нового свойства
    let propertyInputID = `property${templateType}`//id input для ввода имен свойств и их значений
    while(document.getElementById(`${propertyInputID}${newPropertyNumber}`) != null) {//пока есть свойства
        if(document.getElementById(`${propertyInputID}${newPropertyNumber}`).value === "") {//если имя свойства не введено
            newPropertyNumber++
            continue
        }
        if(!isFirstProperty) {
            cypher += ","
        }
        if(document.getElementById(`${propertyInputID}${newPropertyNumber}`).value === "") {//скорее всего лишняя строчка, менять боюсь
            continue
        }
        cypher += `${replacementSpaces(document.getElementById(`${propertyInputID}${newPropertyNumber}`).value)}: "
        ${document.getElementById(`${propertyInputID}${newPropertyNumber++}Value`).value}"`//добавление свойства в команду
        isFirstProperty = false
    }
    return cypher
}

function addOption(optionName, templateType) {//добавление опции в select
    let select = document.getElementById(templateType)//select для выбора типа связи или вершины
    for (let i = 0; i < select.options.length; i++) {//проверка на присутствие добавляемого имени в списке
        if(select.options[i].text === optionName) {
            return
        }
    }
    select.add(new Option(optionName, optionName, false, true))//добавление имени и его выделение
}

function addNodeByTamplateClick() {//добавление вершины
    if(document.getElementById("caption").value === "") {//если не введено имя вершины
        return
    }
    let isFirstLevel = false
    let templatesSelector = document.getElementById("Label")//select для выбора типа верщины
    let captionOfTemplate//имя типа
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип") {//если новый тип
        if(document.getElementById("nameOfLabel").value === "") {//если имя типа не введено
            return
        }
        isFirstLevel = true
        captionOfTemplate = replacementSpaces(document.getElementById("nameOfLabel").value)//имя типа без пробелов
        addOption(captionOfTemplate, "Label")//добавление типа в select
        config.labels[captionOfTemplate] = {//добавление типа в config
            caption: "title",
            size: "size",
            community: "topicNumber"
        }
    }
    else {
        captionOfTemplate = templatesSelector.options[templatesSelector.selectedIndex].text//имя типа из select
    }
    let propertys = readPropertys("Label")//считывание свойств вершины
    let isFirstProperty = (propertys === "") ? true : false//считались ли свойства
    let comma = isFirstProperty ? "" : ","//запятая если есть свойства
    let cypher = `create (a:${captionOfTemplate} {${propertys}${comma}
        title: "${document.getElementById("caption").value}",
        size: ${document.getElementById("size").options[document.getElementById("size").selectedIndex].value},
        id: ${++lastID}})`//создание команды с добавлением имени, размера и id вершины
    console.log(cypher)
    let session = driver.session()
    session
        .run(cypher)//добавление вершины
        .then(() => {})
        .catch(error => {
            console.log(error)
            alert("Не получилось добавить вершину. Возможно вы где-то ввели недопустимый символ.")
            alert(cypher)
        })
        .then(() => {
            session.close()
            updateGraph()//обновление графа
            updateMenu()
        })
        newPropertysLabelCount = 0
        document.getElementById("caption").value = ""//очистка input и обнуление полей
}

function clickOnULSearch(event, node, UL) {//функция клика по элементу поиска
    let selectedNodeId = event.target.closest("li").value
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].value == selectedNodeId) {
            document.getElementById(node).value = nodeSelector.options[i].text//заполнение вершины
            clearUL(UL)
            if(node === "firstNode") {
                firstNodeID = selectedNodeId//сохранение id выбранного элемента
            }
            else {
                secondNodeID = selectedNodeId
            }
            return
        }
    }
}

function clearUL(UL) {//очистка UL
    let list = document.getElementById(UL)
    while (list.hasChildNodes()) {
        list.removeChild(list.firstChild);
    }
}

//!!! Костыль ([:subsection*0..100]) не показывает деревья с больше чем 100 этажей
function addOneWayFilter() {
    viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[*0..100]->()  RETURN p")
}

function showOneWayFilter() {
    viz.renderWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[*0..100]->()  RETURN p")
}

function addDepthFilter() {
    let depth = parseInt(document.getElementById("depth").value)
    if (isNaN(depth)) {
        alert("Глубина должна быть указана целым числом больше нуля")
        return
    }

    for (let i = depth; i >= 0; i--){
        viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("depthFilterSelector").value
            + "})-[*" + i + "]-()  RETURN p")
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
            + "})-[*" + i + "]-()  RETURN p")
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
        labels: {
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