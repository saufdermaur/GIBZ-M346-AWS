# Praktische Abschlussarbeit

[TOC]

## Projektbeschrieb

Die Abschlussarbeit welche im Rahmen des Modules 364 bearbeitet wurde, hatte das Ziel, eine Webseite zu kreieren, welche Bilder anzeigt und deren Metadaten darstellt. 

Die Logik dahinter ist allerdings einiges Komplizierter. So wurden unter anderem externe Services aber hauptsächlich AWS spezifische Funktionalitäten zu gebrauch gemacht:

<div style="text-align: center;">
    <figure>
        <img src="assets/Komponentendiagramm.png" alt="Object Ownership and Public Access for Bucket" width="500">
        <figcaption>Komponentendiagramm </figcaption>
    </figure>
</div>

Prinzipiell lässt sich der ganze Vorgang in zwei Teile unterteilen; die Lambdafunktion und der Webserver. Diese umfassen die Logik für die Bildverarbeitung und deren Darstellung. Während die spezifischen Services und Funktionen zu den entsprechenden Komponenten in den folgenden Abschnitten genauer erläutert werden, folgt nun eine Übersicht wie die Applikation funktionert:

In einem zwei Minuten Takt, welcher durch einen Cron-Job ausgelöst wird, wird die Lambdafunktion von Cloudwatch gestartet. Die Lambdafunktion beginnt dann, zuerst die neusten Anmeldeinformationen (Credentials) aus dem Secrets Manager zu holen. Mit der von Unsplash zur verfügung gestellten API, wird ein zufällig ausgewähltes Bild heruntergeladen im Format "regular" welches einer Breite von 1080 Pixel entspricht. Bevor das Bild aber im S3 Bucket persistent gespeichert wird, ruft die Lambdafunktion den "Rekognition" Dient auf, welcher das Bild analysiert. Als Resultat erhalten wir eine von künstlicher Intelligenz ausarbeitete Bildbeschreibung. Die 5 Merkmale mit der grössten Konfidenz sowie die Metadaten (Unsplash Id des Bildes, Beschreibung des Bildes und Benutzername des Fotografs) welche wir ebenfalls von Unsplash erhalten, werden anschliessend mithilfe der MongoAPI auf eine MongoDB geschrieben. Diese NoSQL Datenbank erlaubt es, eine freiere Wahl der Entitäten zu gewährleisten. Das heisst, die Daten folgen in der Regel keiner strengen Richtlinie, man kann also beliebige Daten speichern. Das erlaubt es uns, in Zukunft mehr oder andere Metadaten zu speichern. Ist das speichern der Metadaten erfolgreich, wird das Bild im S3 Bucket gespeichert und die Lambdafunktion wird beendet. 
Der Webserver welcher auf einer EC2 Instanz läuft, bezieht sich ebnfalls die Anmeldeinformationen aus dem Secrets Manager und greift mit diesen per MongoAPI auf die MongoDB zu. Anschliessend wird im S3 Bucket nachgeschaut, ob die Bild Id welche von den Metadaten bezogen wurde, auch im S3 Bucket vorliegt, wenn ja, wird das Bild mit den entsprechenden Metadaten angezeigt. 
Schliesslich sieht der Benutzer alle zwei Minuten ein neues Bild mit deren Metadaten auf einer Homepage. 

---
## Vorgehen 

Für die Durchführung dieser Aufgabe wir folgend fortgefahren:

1. secrets manager (wird während Bearbeitung der Aufgabe ständig aktualisiert)
2. Mongodb erstellen (ip access beachten)
3. S3 bucket erstellen (public access konfigurieren sodass webseite davon beziehen kann)
4. lambda layer erstellen (beinhaltet axios, mongodb => dependencies für lambda)
5. lambda funktion erstellen (node 20.x)
6. ec2 webserver erstellen und dynamisch inhalt von s3 und mongodb laden
7. EventBridge trigger alle 2 minuten
8. load balancer
9. Auto scaling Service (für Redundanz)
9. hosted zone (subdomain)  

## AWS Secrets Manager

Damit die Credentials für die jeweiligen Services nicht hardcodiert werden müssen, wird der `AWS Secrets Manager` verwendet. Dieser erlaubt es, zentralisiert Key/Value-Pairs zu speichern und diese bspws. in EC2 oder Lambda zu verwenden.

AWS Secrets Manager => Store a new secret => Other type of secret

Damit die Secrets auch von EC2 oder Lambda ausgelesen werden können, müssen entsprechende Berechtigungen der `Lab Role` zugewiesen werden. Hierbei existieren verschiedene Möglichkeiten um Berechtigungen zu erteilen. Eine Möglichkeit ist es, über das `Identity and Access Management (IAM)` der Rolle den Zugriff für den Secrets Manager zu erteilen. Leider geht das aufgrund der Benutzerberechtigung der AWS Umgebung im Learner Lab nicht. Bedeutet, dass ich mit meinem Account keine Berechtigungen im IAM verteilen kann (so hat es zumindest während der Bearbeitung der Aufgabe ausgesehen). Desweiteren gibt es die Möglichkeit via `AWS Secrets Manager` bei jedem Schlüssel eigene Berechtigungen festzulegen. Dies kann einfach mit folgendem JSON unter `Resource permissions` beim jeweiligen Key angegeben werden:

```JSON
{
  "Version" : "2012-10-17",
  "Statement" : [ {
    "Effect" : "Allow",
    "Principal" : {
      "AWS" : "arn:aws:iam::561824754533:role/LabRole"
    },
    "Action" : "secretsmanager:GetSecretValue",
    "Resource" : "*"
  }, {
    "Effect" : "Allow",
    "Principal" : {
      "AWS" : "arn:aws:iam::561824754533:role/EMR_EC2_DefaultRole"
    },
    "Action" : "secretsmanager:GetSecretValue",
    "Resource" : "*"
  } ]
}
```

Dabei muss der `ARN` von der Rolle angegeben werden, welche die Berechtigung `GetSecretValue`erhalten soll. In meinem Fall ist das die `LabRole`. 

Das angeben der Berechtigung wird für jeden Secret wiederholt. 

Schliesslich habe ich die folgenden Schlüsselpaare

```
MONGODB_CLUSTER
MONGODB_PASSWORD
MONGODB_USERNAME
MONGODB_COLLECTION_NAME
MONGODB_DATABASE_NAME
S3_BUCKET_NAME
UNSPLASH_ACCESS_KEY
```

<div style="text-align: center;">
    <figure>
        <img src="assets/SecretMan_config_bucket.png" alt="Configuration for the S3 Bucket in AWS Secrets Manager" width="500">
        <figcaption>Konfiguration des Secrets für den S3 Bucket</figcaption>
    </figure>
</div>

Abschliessend erlaubt es der Secrets Manager einfach und konsequent Anmeldeinformationen zu speichern. Der Vorteil dieses Services ist es, dass er vollumfänglich von den anderen Services (Lambda, EC2) unterstütz wird und ein (mehr oder weniger) einfaches auslesen ermöglicht. Des weiteren können für den produktiven Betrieb Rollen und Berechtigungen spezifisch gesetzt werden, um die Sicherheit zu erhöhen. 

## Mongodb 

Bei der MongoDB gibt es nicht viel zu beachten. Nebst einer leeren Instanz musste nur noch der `Network access` konfiguriert werden. Bei dem wurde eingestellt, dass alle IP-Adressen zugriff auf die DB besitzten. Natürlich werden immernoch Anmeldeinformationen verlangt, doch wird die Firewall somit etwas entschärft. Der Grund dafür ist, dass die Services welche die MongoDB benötigen, einer öffentlichen IP zugewiesen sind. Diese kann sich immer wieder ändern (wenn nicht expliziert definiert) was dazu führen würde, dass bei jeder IP änderung der Netowrk access auf die neue IP angepasst werden müsste. Dies wird mit dem setzen von der IP-range `0.0.0.0/0` umgangen, birgt aber ein höheres Sicherheitsrisiko. Da es sich hierbei um keine produktive Umgebung handelt, ist dies also kein Problem.

<div style="text-align: center;">
    <figure>
        <img src="assets/MongoDB_summary.png" alt="Created MongoDB" width="500">
        <figcaption>MongoDB für die praktische Prüfung</figcaption>
    </figure>
</div>

Als Alternative zur gewählten MongoDB wären alle anderen NoSQL Datenbanken in Frage gekommen, da die Anforderung vorsieht, dass Metadaten einfach erweitert werden können. Dies lässt sich mit NoSQL Datenbanken umsetzten da diese keinen strenen Bedingungen folgen. Die womöglich optimalse Technologie wäre aber AWS' DynamoDB. Dies ist eine hauseigene NoSQL Datenbank von AWS und integriert dementsprechend sehr gut mit den anderen von AWS gebrauchten services. Trotzdem ist der Zugriff zur MongoDB einfach und benötigt im Prinzip nur die API. Da wir in Aufgabe 6 bereits mit MongoDB gearbeitet haben, ist es trivial, diese bereits implementierte Technologie wiederzuverwerten. 

## S3 Bucket

Der Bucket muss so konfiguriert werden, dass er erlaubt, Bilder im Internet öffentlich zu machen. Entweder kann man Global festlegen, dass jedes Bild publiziert wird oder man entscheidet sich jeweils genau, welches öffentlich gemacht werden soll. Ich habe mich für letzteres entschieden, um mehr Kontrolle über die Inhalte zu haben. Ich möchte z.B. nicht ein persönliches Bild hochladen und dieses automatisch online haben...
Damit dies bewerkstelligt werden konnte, mussten die ACLs aktiviert werden und `Block all public access` abgewählt werden. Diese Einstellungen erlauben, dass Berechtigungen einzeln auf den jeweiligen Bildern gesetzt werden können. In unserem Fall ein Bild also öffentlich zu machen. Desweiteren wird so erlaubt, dass wir über die Lambdafunktion die Berechtigungen auf ein Bild überhaupt setzten können. 

<div style="text-align: center;">
    <figure>
        <img src="assets/S3_config.png" alt="Configuration of the S3 Bucket" width="500">
        <figcaption>Einstellungen des S3 Buckets</figcaption>
    </figure>
</div>

Für das speichern des Bildes gibt es genügend Alternativen welche alle vor- oder nachteile haben. So wäre es möglich gewesen, ein AWS Elastic File System zu erstellen. Dies ist ein Datenspeicher der zwischen EC2 Instanzen geteilt wird und ebenfalls Daten persistent speichert. Vorteil dabei ist, dass es womöglich einfacher ist, die Bilder herunterzuladen und wieder zu holen, es wäre somit auch gleich möglich auf die Lambdafunktion zu verzichten und alles über eine EC2 Instanz laufen zu lassen. Auch hier, es ist für die anfängliche Entwicklung etwa einfacher doch macht es das Prinzip von Microservices und deren Modularität zu nichte. Daher habe ich mich für die Konventionelle Art - mit S3 Bucket, Lambdafunktio und EC2 Instanz entschieden.


## Lambda  

Ist die MongoDB erstellt, deren Credentials im Secrets Manager eingetragen und der Bucket konfiguriert. Kann der zweite Teil, das erstellen der Lambda Funktion angegangen werden. 

Die folgende Lambda-Funktion basiert auf Node.js 20.x. Damit diese mit der Unsplash-API und MongoDB-API arbeiten kann, benötigt sie dependencies. Diese sind nicht direkt in der Laufzeitumgegbund integriert und müssen somit manuell hinzugefügt werden. Dies kann aber mithilfe einiger Online-Ressourcen relativ einfach implementiert werden. Dafür benötigt man ein sogenanntes Lambda-Layer.

Während dem bearbeiten der Aufgabe habe ich mir überlegt, ob es nicht sinnvoller gewesen wäre, eine andere Entwicklungsumgebung wie bspws. C# oder Python zu verwenden, da dort womöglich die benötigten Libraries/Dependencies bereits beinhaltet werden. Allerdings wird in [diesem](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) Artikel erwähnt, dass der Benutzer selbst zu den benötigten Abhängigkeiten schauen muss. Welche aber bereits von Lambda selbst integriert sind, habe ich leider nicht gefunden. Somit spielt es meines Erachtens keine Rolle, welche Umgebung verwedent wird, da überall Dependencies/Libraries als Layer hinzugefügt werden müssen. 

### Lambda Layer

Das Lambda Layer stellt der zugehörigen Lambda-Funktion benötigte Dependencies bereit. Damit die Dependencies auf AWS hochgeladen werden können, müssen diese zuerst auf dem lokalen Rechner heruntergeladen und gezippt werden.

1. Lokalen order erstellen
2. Im Ordner Befehle `npm init -y`, `npm install axios mongodb` ausführen
3. Lokalen Ordner zu .zip machen

Somit haben wir die Dependencies/Libraries in einem zip-Format, welches von Lambda gelesen werden kannn.

Die Einbindung erfolgt wie folgt:

1. Auf die Lambda-Seite navigieren
2. `Layers` auswählen
3. Ein neues Layer erstellen (create layer)
4. Dieses Konfigurieren indem die Laufzeit angegeben wird und das Zip hochgeladen wird.

<div style="text-align: center;">
    <figure>
        <img src="assets/LambdaLayer_create.png" alt="Creation of the Lambda Layer" width="500">
        <figcaption>Konfiguration des Lambda Layers</figcaption>
    </figure>
</div>

### Lambda Function

Erstellen der Lambda Funktion:

1. Lambda Seite navigieren
2. `Functions` reiter anwhälen
3. Create function 
4. `Nodejs 20.x` als Umgebung auswählen
5. `Change default execution role` die LabRole auswählen. 

<div style="text-align: center;">
    <figure>
        <img src="assets/LambdaFunction_create.png" alt="Creation of Lambdafunction" width="500">
        <figcaption>Einstellungen der Lambdafunktion</figcaption>
    </figure>
</div>

Das auswählen der execution role umfasst zwei Gründe; erstens kann die Funktion nur erstellt werden, wenn eine Rolle angegeben wird, welche Berechtigung hat, auf Cloud Watch (logging service) zu schreiben. Zweitens greifen wir in der Funktion auf den API-Dienst von MongoDB zu. Dafür werden Credentials benötigt welche im Secrets Manager definiert sind. Damit diese ausgelesen werden können, haben wir bei den jeweiligen Secrets im SecretsManager angegeben welche Rollen auf die Ressourcen Zugriff haben. Da dies die LabRole ist, wird diese selektiert. 

Da die benötigten Dependencies nun vorhanden sind, wird die Lambda-Funktion erstellt, welche das Bild von Unsplash in den S3 Bucket herunterlädt und die Metadaten in MongoDB speichert.

Unter `Layers` wird der vorherig erstellte Layer hinzugefügt. Hierbei wird das Layer anhand des ARN (eindeutige ID) ausgewählt, dieser findet sich bei der Detailansicht des Lambda Layers. 

<div style="text-align: center;">
    <figure>
        <img src="assets/LambdaFunction_addLayer.png" alt="Add Layer to Function" width="500">
        <figcaption>Konfiguration, um Layer an der Funktion anzubinden</figcaption>
    </figure>
</div>

Der [Code]() wird anschliessend in das `index.mjs` geschrieben und muss mit dem Button `Deploy` gespeichert werden. 

Zu beachte gilt noch, dass die Timeout Dauer erhöht wird. Durch das Fetchen von Unsplash und den sonstigen Operaionen kann es sein, dass die Lambdafunktion länger als drei Sekunden daurt und in einem Timeout endet. Dies kann über Configruation => General configuration angepasst werden. Ich verwende 30s.

Bevor fortgefahren wird mit der EC2 Instanz welche den Webserver zur Verfügung stellt, wird ein Test durchgeführt welcher mit dem gleinchamigen Button ausgeführt werden kann. Der Test Event reicht mit der Standardkonfiguration aus und benötigt nur einen Namen. Ein erfolgreicher Test gibt einen HTTP Code 200. Zudem haben wir ein öffentlich einsehbares Bild im Bucket und auf MongoDB den MetadatenEintrag gemäss Anforderungen.

<div style="text-align: center;">
    <figure>
        <img src="assets/LambdaFunction_testSuccess.png" alt="Test success" width="500">
        <figcaption>Antwort des Tests i.O.</figcaption>
    </figure>
</div>

<div style="text-align: center;">
    <figure>
        <img src="assets/MongoDB_testMetadata.png" alt="Stored metadata in MongoDB" width="500">
        <figcaption>Erster Eintrag von Metadaten in der MongoDB</figcaption>
    </figure>
</div>

<div style="text-align: center;">
    <figure>
        <img src="assets/S3_publiTestImage.png" alt="Public available Image" width="500">
        <figcaption>Öffentliches Bild im S3 Bucket</figcaption>
    </figure>
</div>

## EC2 Webserver

Für das erstellen der Instanz wird eine [Cloud-Init]() Datei verwendet. 

Konfiguriert wurde folgendes

1. Ubuntu 22.04
2. Neues Key Pair 
3. Neue Security group
4. Selektieren der IAM 
5. Hochladen des Cloud-Init

Ubuntu 22 wird verwendet, da einige Dependencies nicht auf dem neues Ubuntu 24 funktionieren. Ein neues Schlüsselpaar wurde definiert, um die praktische Prüfung von den anderen Aufgaben zu trennen. Weiter wurde eine neue `Security Group` erstellt, welche als Outbound-Rule alles zulässt (0.0.0.0/0) und als Inbound-Rule SSH Port 22, HTTP Port 80 und HTTPS Port 443. Wir verwenden zwar kein HTTPS da wir kein SSL-Zertifikat besitzten, doch trifft man beim Zugriff auf die Webseite schneller auf den geschlossenen Port als wenn man auf den Timeout wartet...
Sehr wichtig ist, wie bereits bei der Lambdafunktion definiert, dass auswählen einer Rolle, welche den Zugriff auf den Secrets Manager hat. Diese wurde ebenfalls im SecretsManger bei den jeweiligen Secrets angegeben und muss nun selektiert werden. Die EC2 Instanz läuft anschliessend mit dieser Rolle und erlaubt das auslesen der Schlüsselpaare. 

Der Webserver läuft nachher mithile von Apache und zeigt mithilfe eines PHP Scripts fortlaufend die neuen Inhalte von der MongoDB mit den jeweiligen Bildern an. 

Bei der Konfiguration der EC2 Instanz hatte ich am meisten Probleme. Grund dafür war das mühsame auslesen der Secrets aus dem Secrets Manager. Folgende Varianten habe ich ausprobiert:

1. Aus dem MongoAPI Call die Credentials vom Secrets Manager auslesen und so Anfrage senden => Garantiert immer aktuelle Secrets, wird alle zwei Minuten per Cron Job aufgerufen
2. Secrets per Cron Job aufrufen und als ENV speichern. MongoAPI Call greift diese ENV zu und ruft als CronJob alle zwei Minuten API ab. Es muss geschaut werden, dass die Credentials immer aktuell sind. Bspws. mit einem Cronjob.
3. Script ausführen welches Secrets aus SecretsManger liest und im gleichen Script den API Call mit den Variablen macht, Script als Cronjob.

Hierbei hat einzig und allein die Letzte und meines Erachtens schlechteste Methode funktioniert. So wie es jetzt implementiert ist, wird das `Credentials.sh` skript beim erstellen der EC2 Instanz aufgerufen welches die Secrets aus dem Secrets Manager holt und diese als ENV auf dem System speichert. Im gleichen Atemzug wird der API Call initialsiert welcher jede Minute (nicht alle zwei um immer auf dem Stand des S3 Buckets/MongoDB zu sein) die Metadaten aus der MongoDB holt und diese in einer Datei ablegt. Hier ist schon das erste Problem; werden die Secrets geändert, werden diese nicht automatisch übernommen. Es geschieht kein neuer Abruf der Variablen. Bis hierhin geht es nur um das holen und speichern der Metadaten. Angezeigt werden diese durch das PHP Skript. Aus dem S3 Bucket wird das Bild geholt und aus dem Metadatenfile werden die enstprechenden Bildinformationen geholt. Der Connectionstring für den S3 Bucket muss ich hierbei hardcodieren da ich keine Möglichkeit gefunden habe auf den Secret Manager oder den ENV Variablen zuzugreifen. Damit die aktualisierten Daten angezeigt werden, wird die Seite jede Minute neu geladen. 

Somit funktioniert dieses Cloud-Init Skript doch ist es bestimmt nicht produktiv einsetzbar. Vor allem die Credentials sind hier die grösste Hürde. Diese müssen stets aktuell und sicher aufbewart werden. Nichtsdestotrotz war es möglich die Credentials aus dem Secrets Manager auszulesen und zu verwenden. 

## Automatisieren mit Event Bridge

Da der Webserver nun funktioniert. Möchten wir, dass alle zwei Minuten ein Bild von Unsplash heruntergeladen und verarbeitet wird. Dies kann sehr einfach mit EventBridge umgesetzt werden.

1. Amazon EventBridge
2. Schedules
3. Create schedule
4. Unter schedule pattern wird mit der Cron expression `*/2 * * * * ? *` angegeben, dass es alle zwei Minuten laufen soll.
5. Target detail: AWS Lambda
6. Funktion auswählen
7. Action after schedule completion: NONE (Der Vorgang soll immer weiter laufen...)
8. Permissions: LabRole 

<div style="text-align: center;">
    <figure>
        <img src="assets/EB_Scheduler.png" alt="EventBridge Cron Job" width="500">
        <figcaption>Die nächsten Ausführzeiten des Events</figcaption>
    </figure>
</div>

## Load Balancer und AutoScaling

Mit der anhin umgesetzten Applikation werden alle zwei Minuten Bilder aus Unsplash heruntergeladen und mit den jeweiligen Metadaten auf der Homepage angezeigt. In diesem Abschnitt wird ein Load Balancer und ein AutoScaling Service erstellt. Diese Kombination erlaubt es, stets eine gewünschte Anzahl von EC2 Instanzen am laufen zu haben und die Last auf diese gleichmässig zu verteilene. Darüber hinaus, werden die Instanzen in jeweils verschiedenen Availability Zones laufen, was die Redundanz erhöht. 


Folgender Ablauf wird nicht in grossem Detail dokumentiert, da dies auf der Aufgabe 06: Scaling basiert und dort detaillierter niedergeschrieben ist. Trotzdem wie folgt der Ablauf:

1. Target Group erstellen
    1. EC2
    2. Target Groups
    3. Create target group
    4. Instances

<div style="text-align: center;">
    <figure>
        <img src="assets/TG_ForLoadBalancer.png" alt="Configuration for Target Group" width="500">
        <figcaption>Einstellungen der Target Group</figcaption>
    </figure>
</div>

2. Load Balancer konfigurieren
    1. EC2
    2. Load Balancer
    3. Application
    4. Availability Zones
    5. Security Groups
    6. Target Groups

<div style="text-align: center;">
    <figure>
        <img src="assets/LB_AvailabilityZones.png" alt="Configuration for Availability Zones" width="500">
        <figcaption>Die selektierten Availability Zones für mehr Redundanz</figcaption>
    </figure>
</div>

<div style="text-align: center;">
    <figure>
        <img src="assets/LB_Summary.png" alt="Summary of Load Balancer" width="500">
        <figcaption>Zusammenfassung des Load Balancers</figcaption>
    </figure>
</div>

<div style="text-align: center;">
    <figure>
        <img src="assets/LB_WebserverAvailable.png" alt="Webserver through Load Balancer" width="500">
        <figcaption>Erreichbar: Der Webserver via Load Balancer</figcaption>
    </figure>
</div>

Bis zu diesem Zeitpunkt haben wir einen LoadBalancer mit einer öffentlich erreichbaren URI, doch zeigt diese auf immer die gleiche Instanz. Dies wollen wir nun ändern. 

3. Launch Template erstellen
    1. EC2
    2. Launch Templates
    3. Analog konfigurieren wie die EC2 Instanz 
4. Auto scaling service definieren
    1. EC2
    2. Auto Scaling Groups
    3. Launch template auswählen
    4. Availability Zones auswählen (gleiche wie Load Balancer)
    5. Attach to an existing load balancer
    6. Target group auswählen
    7. Turn on Elastic Load Balancing health checks
    8. Min 2 Instanzen

Sind die Instanzen "Healthy" kann über die URI des Load Balancers immernoch auf die Seite zugegriffen werden. Jetzt haben wir allerdings eine gewisse Redundanz, denn drei Instanzen (2 von Auto Scaler, 1 manuell erstellte) laufen zurzeit. Mit zwei Instanzen (die vom auto scaler) kann man immer rechnen, ausser AWS hat einen weiten Systemausfall was aber sehr unwahrscheinlich ist.

<div style="text-align: center;">
    <figure>
        <img src="assets/TG_RunningInstances.png" alt="Healthy Instances" width="500">
        <figcaption>Drei gesunde Instanzen</figcaption>
    </figure>
</div>


## Hosted Zone 

Der DNS Name um den Webserver nun zu erreichen ist folgender: `praktischePruefungLB-121437075.us-east-1.elb.amazonaws.com` dies ist eine unschöne URI und soll nun durch die Subdomain `sebastian.m346.ch` "ersetzt" werden. 

Dafür muss zuerst eine Hosted Zone erstellt werden.

1. Route 53
2. Create hosted zone
3. Subdomain angeben `sebastian.m346.ch`
4. Dem Adminsistrator der Domain muss den Nameserver (NS) welcher auf der Route 53 Oberfläche ersichtlich ist, mitgeteilt werden. Daraufhin delegiert der Adminstrator alle Verbindung auf die Subdomain auf unsere Hosted Zone,sodass wir diese weiter verwenden können. 
5. create record
6. Alias Definieren: AWS erlaubt es, einen AWS Service auszuwählen und für uns automatisch zu konfigurieren. Somit wird der Load Balancer ausgewählt.

<div style="text-align: center;">
    <figure>
        <img src="assets/HZ_Alias.png" alt="Configuration of Hosted Zone" width="500">
        <figcaption>Konfiguration der Subodmain in der Hosted Zone</figcaption>
    </figure>
</div>

Hat alles funktioniert, ist unser Webserver über die Seite `sebastian.m346.ch` aufrufbar. 

# Reflexion und Abschluss

Die Aufgabe erwies sich als komplexer als anfangs gedacht. Das planen und zusammenstellen ging ziemlich gut. Dies weil die vorherigen Aufgaben in diesem Modul allesamt gewisse Teile dieser Aufgabe beinhalteten. Es war also prinzipiell ein zusammenstellen, der verschiedenen Dienste und womöglich einiger Verbesserungen oder extra Funktionalitäten. Secrets Manager, Events Bridge oder Lambda Layer waren zusätzliche Konfigurationen welche neuland für mich waren - und entsprechend Zeit gekostet haben. 
Wie bereits gesagt, war das mit Abstand schwierigste das Handling der Credentials. Zum einen Berechtigungen zu erteilen, sodass Lambda oder EC2 diese auslesen können, zum anderen die Speicherung, aktualisierung und schliesslich deren Verwendung. Deren Implementation in der Lambdafunktion, finde ich gelungen; stets wenn diese Ausgeführt wird, holt sie sich die neuen Anmeldeinformationen. Die Werte sind nicht hardcodiert und erlauben ein einfach austauschen der Variablen im Secrets Manger. Bei der EC2 Instanz ist dies leider nicht der Fall. Die Credentials werden zwar verwendet, doch habe ich es nicht geschafft, das Aktualisieren dieser in einen Cron job o.ä. zu packen. Hierbei bedarf es mehr technisches know how, um eine sicherere und besser wartbare Lösung zu kreieren. Als weiteren Verbesserungspunkt sehe ich eine optimiertere Abfrage zwischen EC2 und dem S3 Bucket. Hierbei werden zurzeit alle Bilder auf einmal aus dem Bucket bezogen was, je nach Mänge, sehr viel Zeit beansprucht. Dies könnte am einfachsten Optimiert werden, indem die Webpage Seiten bekommen würde. Dies würde garantieren das auf jeder Seite nur bspws. 10 Bilder geladen werden. Möchte man mehr sehen, muss man auf die nächste Seite wechseln. Ansonsten wäre auch die Möglichkeit des lokalen Speichern des Bildes möglich. Dies wäre zwar schneller beim anzeigen, würde aber die Architektur komplexer machen. Dies ist der Fall beim holen der Metadaten. Der Cronjob sorgt dafür, dass jede Minute alle Daten ausgelesen und gespeichert werden. Dies erzeugt, abhängig der Daten, massive Performanceprobleme und müsste für den produktiven Betrieb ebenfalls überarbeitet werden. Am besten wäre genau gleich wie bei den Bildern, nur diese Metadaten zu holen, welche auch wirklich angezeigt werden.
Der Restliche Ablauf schätze ich als erfüllt ein. Durch die Verwendung verschiedener Services entsteht eine dezentralisierte und modulare Architektur welche beliebig skaliert oder ausgetauscht werden kann ohne grosse Unterbrüche zu erleiden. Bspws. müssen die EC2 Instanzen gewartet werden, wäre das herunterladen und bearbeiten der Bildinformationen ebenfalls auf einer EC2 am laufen, würde der ganze Betrieb stoppen. Da aber eine Lambdafunktion benutzt wird, welche unabhängig davon arbeiten kann, gibt es zumindest auf der Backendseite keine Unterbrüche. Weiter ist die Lambdafunktion kostengünstiger, da sie nicht ständig am laufen ist, im vergleich zu einer EC2 Instanz. Da der Benutzer am ständig auf die Website gelangen will, kommt man nicht um einen Webserver der auf einer EC2 Instanz läuft. Damit die Redudndanz und eine allfällige Downtime vermieden werden kann, wurde auch ein Auto Scaling service und Load Balancer integriert. Somit sind stets in min. zwei Availability Zones EC2 Instanzen am laufen. Wird eine Instanz zu sehr beansprucht, lagert der Load Balancer den Verkehr auf die andere Instanz aus, was zu performance Verbesserungen führt.
Zusammenfassend bin ich also relativ zufrieden mit der Lösung. Sie weist redundante Aspekte für einen optimalen Betrieb auf und geht einen modularen Ansatz an. Es ist (teilweise) möglich einen zentralisierten Credentials Manager zu verwenden, um die Anmeldeinformationen zuverlässig zu ändern und spart kösten mit dem verwenden von einer Lambdafunktion. Verbessert werden müssten aber die Verwaltung der Anmeldeinformationen und ein performanteres holen der Bilddateien, Metadaten und dessen anzeigen auf der Webpage.

