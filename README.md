# Praktische Abschlussarbeit

[TOC]

0. secrets manager 
1. Mongodb erstellen (ip access beachten)
2. S3 bucket erstellen (public access konfigurieren sodass webseite davon beziehen kann)
3. lambda layer erstellen (beinhaltet axios, mongodb => dependencies für lambda)
4. lambda funktion erstellen (node 20.x)
5. ec2 webserver erstellen und dynamisch inhalt von s3 und mongodb laden
6. cloud watch trigger alle 2 minuten
7. load balancer
8. hosted zone (subdomain)

---

### AWS Secrets Manager

Damit die Credentials für die jeweiligen Services nicht hardcodiert werden müssen, wird der `AWS Secrets Manager` verwendet. Dieser erlaubt es, zentralisiert Key/Value-Pairs zu speichern und diese bspws. in EC2 oder Lambda zu verwenden.

AWS Secrets Manager => Store a new secret => Other type of secret

Damit die Secrets auch von EC2 oder Lambda ausgelesen werden können, müssen entsprechende Berechtigungen der `Lab Role` zugewiesen werden. Hierbei existieren verschiedene Möglichkeiten um Berechtigungen zu erteilen. Eine Möglichkeit ist es, über das `Identity and Access Management (IAM)` der Rolle den Zugriff für den Secrets Manager zu erteilen. Leider geht das aufgrund der Benutzerberechtigung der AWS Umgebung im Learner Lab nicht. Bedeutet, dass ich mit meinem Account keine Berechtigungen im IAM verteilen kann (so hat es zumindest während der Bearbeitung der Aufgabe ausgesehen). Desweiteren gibt es die Möglichkeit via `AWS Secrets Manager` bei jedem Schlüssel eigene Berechtigungen festzulegen. Dies kann einfach mit folgendem JSON unter `Resource permissions` beim jeweiligen Key angegeben werden:

```JSON
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::561824754533:role/LabRole"
            },
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "*"
        }
    ]
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

### Mongodb 

### S3 Bucket

ACLs, Public access

### Lambda  

Ist die MongoDB erstellt, deren Credentials im Secrets Manager eingetragen und der Bucket konfiguriert. Kann der zweite Teil, das erstellen der Lambda Funktion angegangen werden. 

Die folgende Lambda-Funktion basiert auf Node.js 20.x. Damit diese mit der Unsplash-API und MongoDB-API arbeiten kann, benötigt sie dependencies. Diese sind nicht direkt in der Laufzeitumgegbund integriert und müssen somit manuell hinzugefügt werden. Dies kann aber mithilfe einiger Online-Ressourcen relativ einfach implementiert werden. Dafür benötigt man ein sogenanntes Lambda-Layer.

Während dem bearbeiten der Aufgabe habe ich mir überlegt, ob es nicht sinnvoller gewesen wäre, eine andere Entwicklungsumgebung wie bspws. C# oder Python zu verwenden, da dort womöglich die benötigten Libraries/Dependencies bereits beinhaltet werden. Allerdings wird in [diesem](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) Artikel erwähnt, dass der Benutzer selbst zu den benötigten Abhängigkeiten schauen muss. Welche aber bereits von Lambda selbst integriert sind, habe ich leider nicht gefunden. Somit spielt es meines Wisssens nach keine Rolle, welche Umgebung verwedent wird da überall Dependencies/Libraries als Layer hinzugefügt werden müssen. 

#### Lambda Layer

Das Lambda Layer stellt der zugehörigen Lambda-Funktion benötigte Dependencies bereit. 

1. lokalen order erstellen
2. im ordner Befehle `npm init -y`, `npm install axios mongodb` ausführen
3. lokalen ordner zu .zip machen

lambda => layers => create layer => Konfigurieren, Create

#### Lambda Function

Da die benötigten Dependencies nun vorhanden sind, wird die Lambda-Funktion erstellt, welche das Bild von Unsplash in den S3 Bucket herunterlädt und die Metadaten in MongoDB speichert.

Unter `Layers` wird der vorherig erstellte Layer hinzugefügt. Hierbei wird das Layer anhand des ARN ausgewählt, dieser findet sich bei der Detailansicht des Lambda Layers. 

Der [Code]() wird anschliessend in das `index.mjs` geschrieben und muss mit dem Button `Deploy` gespeichert werden. 


Zu beachte gilt noch, dass die Timeout Dauer erhöht wird. Durch das Fetchen von Unsplash und den sonstigen Operaionen kann es sein, dass die Lambdafunktion länger als drei Sekunden daurt und in einem Timeout endet. Dies kann über Configruation => General configuration angepasst werden. Ich verwende 30s.

Bevor fortgefahren wird mit der EC2 Instanz welche den Webserver zur Verfügung stellt, wird ein Test durchgeführt welcher mit dem gleinchamigen Button ausgeführt werden kann. Der Test Event reicht mit der Standardkonfiguration aus und benötigt nur einen Namen. Ein erfolgreicher Test gibt einen HTTP Code 200. Zudem haben wir ein öffentlich einsehbares Bild im Bucket und auf MongoDB den MetadatenEintrag gemäss Anforderungen.

Lambda => Functions => Create function

#### EC2 Webserver

Für das erstellen der Instanz wird eine [Cloud-Init]() Datei verwendet. 

Ubuntu 22.04
Neues Key Pair 
=> Public `ssh-keygen -y -f praktischePruefungKeyPair.pem > praktischePruefungKeyPair-Public.pub` in InitFile integrieren
Neue security group SSH, HTTP, HTTPS