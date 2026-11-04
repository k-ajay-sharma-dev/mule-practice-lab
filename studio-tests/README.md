# Studio test pack

Six small Mule 4 projects. Each one answers a question about connector behaviour that the documentation does not settle, so that the answer can be fed back into the problems on this site.

**None of these projects has been run.** They were written without Anypoint Studio, a Mule runtime or Docker. The XML files were checked for well-formedness only, so they have not been checked against the connector schemas. Expect to fix small things on first import. Anything likely to need fixing carries an XML comment with the text `TODO verify in Studio` and is listed in [Unconfirmed items](#unconfirmed-items).

All credentials in this folder are local placeholders. Do not commit real AWS keys.

| # | Project | Question in short | Needs |
|---|---|---|---|
| 1 | `imap-read-filter` | Does the IMAP listener pick up an email already marked read? | GreenMail |
| 2 | `kafka-manual-no-commit` | MANUAL with no Commit, and AUTO after a failed flow | Kafka |
| 3 | `kafka-batch-reread` | Can an error handler read batch records twice? | Kafka |
| 4 | `file-raw-read` | Does `read(payload.^raw, ...)` work on a real file stream? | Nothing |
| 5 | `sqs-attributes` | Attribute names, body type, Preserve Messages on failure | LocalStack or AWS |
| 6 | `db-partial-read` | Does `payload[0]` hold connections or cursors? | PostgreSQL |

## Prerequisites

- Anypoint Studio 7 with a Mule 4 runtime and Java 17. The poms use runtime 4.12.2 and `mule-maven-plugin` 4.10.1, copied from your other Mule projects. If your Studio has a different runtime, change `app.runtime` in `pom.xml` and `minMuleVersion` in `mule-artifact.json`.
- Docker Desktop, with the `docker compose` command.
- An Anypoint account signed in to Studio. The Kafka and SQS connectors resolve from Exchange.
- `curl.exe`, which ships with Windows 11. Test 1 uses it for IMAP.
- Test 5 only, if you use real AWS: an AWS account.

Commands below are for PowerShell.

## Import a project into Studio

1. Choose **File > Import > Anypoint Studio > Anypoint Studio project from File System**.
2. Select the folder, for example `studio-tests/imap-read-filter`.
3. Pick your runtime and finish. Wait for dependency resolution to complete.
4. If a Kafka or SQS dependency does not resolve, use **Add Modules > Search in Exchange**, add the connector, and let Studio write the version into `pom.xml`. Note the version in your results.
5. Run with **right-click the project > Run As > Mule Application**. Log lines appear in the Console view.

Menu labels are from memory of Studio and can differ slightly between versions.

If Studio marks an attribute as invalid, open that component in the properties panel, set the field there, and let Studio write the XML. Then note the correct name in your results, because that is useful information in its own right.

## Start the supporting services

From the `studio-tests` folder, start only what the test needs:

```powershell
docker compose up -d greenmail     # Test 1
docker compose up -d kafka         # Tests 2 and 3
docker compose up -d localstack    # Test 5, LocalStack route
docker compose up -d postgres      # Test 6
docker compose ps
docker compose down                # stop everything when finished
```

| Service | Image | Host port |
|---|---|---|
| Kafka | `apache/kafka:3.9.2` | 9092 |
| GreenMail | `greenmail/standalone:2.1.15` | 3025 SMTP, 3143 IMAP |
| PostgreSQL | `postgres:16-alpine` | 55432 |
| LocalStack | `localstack/localstack:4.14.0` | 4566 |

All four tags were confirmed on Docker Hub on 2026-11-04. All ports bind to `127.0.0.1`. GreenMail keeps mail in memory, so `docker compose restart greenmail` gives you empty mailboxes.

---

## Test 1: imap-read-filter

**Problems:** inc-075, ms-081, fl-079

**Goal.** Find out whether `email:listener-imap` dispatches an email that is already marked read, (a) with no matcher and (b) with an explicit matcher where `seen` is INCLUDE.

**Why it is uncertain.** The reference says of the listener's matcher that "already read emails will be filtered" by default, but lists Seen with a default of INCLUDE and does not define that value. The 1.8.0 release notes (W-1638060) say the listener now processes only unread emails by default. That points towards case (a) but does not settle case (b).

**How it is built.** Two listeners on two separate mailboxes, because fetching an email can change its seen flag, and a shared mailbox would let one listener disturb the other. Each poll is two minutes apart, which leaves time to mark an email between polls. A `CONTROL` email that stays unread proves that a poll took place, so its absence cannot be mistaken for a filtered email.

**Steps**

1. `docker compose up -d greenmail`, then run the project.
2. Wait for the first poll to pass. The app has just started, so waiting about 15 seconds is enough. The mailboxes are empty at this point.
3. Send two emails and mark one of them read, all before the next poll:

   ```powershell
   curl.exe -X POST "http://localhost:8091/seed?subject=CONTROL-1"
   curl.exe -X POST "http://localhost:8091/seed?subject=READ-1"
   curl.exe -s -u default-reader:placeholder "imap://localhost:3143/INBOX" -X "UID FETCH 1:* (FLAGS)"
   curl.exe -s -u explicit-reader:placeholder "imap://localhost:3143/INBOX" -X "UID FETCH 1:* (FLAGS)"
   ```

   The last two commands show each email's UID and flags without opening it. Use the UID of `READ-1` (it should be 2 in both mailboxes):

   ```powershell
   curl.exe -X POST "http://localhost:8091/mark-read?id=2"
   ```

   Run the two `UID FETCH` commands again and confirm that `\Seen` is set on UID 2 in both mailboxes and not on UID 1.

4. Wait for the next poll, then for one more, so that at least two polls have run after `READ-1` was marked.

**What to observe**

- `RESULT-A no-matcher dispatched` and `RESULT-B explicit-matcher seen=INCLUDE dispatched` lines in the Console. Which subjects appear on each?
- The value of `seen` in each line.
- `CONTROL-1` must appear on both listeners. If it does not, no poll ran and the run tells you nothing.
- Run `UID FETCH` again afterwards. Did the listener itself set `\Seen` on `CONTROL-1`?

**Optional runs**

- Set `matcher.seen` to `REQUIRE`, then `EXCLUDE`, in `config.yaml`, restart GreenMail and the app, and repeat. The reference does not define these values. This shows which setting actually retrieves read mail, which is what the fix in inc-075 needs.
- For fl-079, move a processed email away and back, and see whether it is dispatched again. Moved emails usually get a new UID, so look it up first:

  ```powershell
  curl.exe -X POST "http://localhost:8091/move?id=1&from=INBOX&to=Failed"
  curl.exe -s -u default-reader:placeholder "imap://localhost:3143/Failed" -X "UID FETCH 1:* (FLAGS)"
  curl.exe -X POST "http://localhost:8091/move?id=1&from=Failed&to=INBOX"
  ```

**Result**

```
Case (a) no matcher, READ-1 dispatched?          
Case (b) seen=INCLUDE, READ-1 dispatched?        
CONTROL-1 dispatched on both?                    
Optional: REQUIRE / EXCLUDE results:             
Optional: email moved back to INBOX dispatched?  
Connector version used:                          
```

---

## Test 2: kafka-manual-no-commit

**Problems:** inc-078, fl-077

**Goal.** Find out (1) whether a MANUAL listener with no Commit keeps receiving later records, (2) where it resumes after a restart, and (3) whether a record is delivered again after a failed flow in AUTO mode, and when.

**Why it is uncertain.** The reference says MANUAL needs a Commit and AUTO commits if the flow finishes successfully. It does not say what happens if Commit is missing or how a failed record comes back.

**Setup**

```powershell
docker compose up -d kafka
docker exec studio-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic studio.manual --partitions 1 --replication-factor 1
docker exec studio-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic studio.auto --partitions 1 --replication-factor 1
docker exec studio-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group studio-manual-group --topic studio.manual --reset-offsets --to-earliest --execute
docker exec studio-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group studio-auto-group --topic studio.auto --reset-offsets --to-earliest --execute
```

The reset commands matter. Auto offset reset defaults to LATEST, and a group with no committed offset would otherwise start at the end of the topic after a restart, which would look as if nothing had been redelivered. Scenario C tests that case on purpose.

To send one record:

```powershell
"NOCOMMIT-1" | docker exec -i studio-kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic studio.manual
```

To see the committed offset and lag of a group:

```powershell
docker exec studio-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group studio-manual-group
```

Send records one at a time and wait for the log line. The reference does not say whether one commit key covers every record of the same poll, and this keeps each poll to one record.

**Scenario A: MANUAL, later records.** Start the app. Send `COMMIT-1`, then `NOCOMMIT-2`, `NOCOMMIT-3` and `NOCOMMIT-4`. Check that `MANUAL received` lines appear for all of them, then run `--describe`. Leave it for two minutes and watch for repeats.

**Scenario B: MANUAL, restart.** Stop the app. Run `--describe` and note `CURRENT-OFFSET`. Start the app. Note which offsets arrive again, starting from which one.

**Scenario C: MANUAL, nothing ever committed.** Stop the app and delete the group's position:

```powershell
docker exec studio-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --delete --group studio-manual-group
```

Start the app, wait for the listener to connect, and send `NOCOMMIT-5`. Stop and start the app. Does `NOCOMMIT-5` arrive again? This shows the difference between resuming from a committed offset and having none.

**Scenario D: AUTO, failed flow.** With the app running, send to `studio.auto`:

1. `OK-1`, then run `--describe --group studio-auto-group`.
2. `FAIL-1`. Watch for two minutes. Note the time of every `AUTO received` and `AUTO flow failed` line. Run `--describe`.
3. `OK-2`. Was it delivered? In what order relative to any repeats of `FAIL-1`? Run `--describe`. If the committed offset is now past `FAIL-1`, that record was skipped, which matters for fl-077.
4. Stop and start the app. Is `FAIL-1` delivered again?

**What to observe.** The `offset` in each received line, the time gaps between repeats, and `CURRENT-OFFSET`, `LOG-END-OFFSET` and `LAG` from `--describe`.

**Result**

```
A: later records received with no Commit?               
A: any repeats while running?                           
A: CURRENT-OFFSET after the run:                        
B: first offset received after restart:                 
C: nothing committed, record seen again after restart?  
D: FAIL-1 delivered again without a restart? How often? 
D: interval between deliveries:                         
D: OK-2 delivered? Before or after a repeat?            
D: committed offset after OK-2:                         
D: FAIL-1 delivered after restart?                      
Connector version used:                                 
```

---

## Test 3: kafka-batch-reread

**Problem:** fl-082

**Goal.** Find out whether an error handler on `kafka:batch-message-listener` can read the batch records a second time.

**Why it is uncertain.** The reference says this source's streaming strategy is non-repeatable. fl-082 keeps the records in a variable and walks them again in On Error Continue. Nothing says whether that works for the outer array, for each record's content, or for neither.

**How it is built.** The handler makes four separate reads, each in its own Try, so one failure does not hide the others:

| Log tag | What it reads |
|---|---|
| `READ-2A` | The size of `vars.records` |
| `READ-2B` | The content of every record in `vars.records` |
| `READ-2C` | `vars.records` through For Each, as in fl-082 |
| `READ-2D` | A text copy taken before the first read (only with `snapshot.enabled: "true"`) |

Every batch reaches the handler. A good batch passes `READ-1` and then hits a forced error. A bad batch fails during `READ-1` on its malformed line.

**Steps.** Records must arrive together to form a batch, so produce them while the app is stopped.

```powershell
docker compose up -d kafka
docker exec studio-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic studio.batch --partitions 1 --replication-factor 1
```

For each run below, with the app stopped:

```powershell
docker exec studio-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group studio-batch-group --topic studio.batch --reset-offsets --to-latest --execute
Get-Content .\kafka-batch-reread\src\main\resources\samples\batch-good.txt | docker exec -i studio-kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic studio.batch
```

Then start the app and read the Console.

1. Run 1: `batch-good.txt`, `snapshot.enabled: "false"`.
2. Run 2: `batch-bad.txt`, `snapshot.enabled: "false"`.
3. Run 3: `batch-bad.txt`, `snapshot.enabled: "true"`.

**What to observe**

- `BATCH started`: is the commit key present, and what class is the payload?
- Does `READ-1 OK` show 5 records? If not, the records were split across polls, and that run is not valid.
- For each of `READ-2A` to `READ-2D`: OK or FAILED, and the record contents. An empty list counts as a failed second read even though it logs no error.
- `HANDLER commit done` or `HANDLER commit FAILED`, which also settles the commit key expression.

**Result**

```
Commit key expression that worked:                      
Run 1 READ-2A / 2B / 2C:                                
Run 2 READ-2A / 2B / 2C:                                
Run 3 READ-2D (and whether READ-1 still parsed):        
Can the handler read the records a second time?         
Connector version used:                                 
```

---

## Test 4: file-raw-read

**Problems:** fl-086, fl-087, fl-088

**Goal.** Find out whether `read(payload.^raw, ...)` works on a real stream from `file:listener` for JSON, CSV and XML, and what changes with `outputMimeType` set on the listener.

**Why it is uncertain.** The docs say each connector tries to determine a file's MIME type from its extension and that `outputMimeType` overrides this. The DataWeave selectors page lists `.^raw` without describing it. The three problems rely on `.^raw` to get past a payload already typed from its extension. That has not been shown on a real stream.

**Sample files** are in `file-raw-read/src/main/resources/samples/`:

| File | Used for |
|---|---|
| `orders.json` | fl-086 JSON route |
| `orders-semicolon.csv` | fl-086 CSV route, read with `separator: ";"` |
| `sales_20261103.csv` | fl-087, including the trailer row |
| `manifest.xml` | fl-086 and fl-088 |

**Steps**

1. Create the folders. If you use another location, change `file.workingDir` in `config.yaml`.

   ```powershell
   $w = "C:\temp\studio-tests\file-raw-read"
   "in-default","in-binary","in-csv","done" | ForEach-Object { New-Item -ItemType Directory -Force "$w\$_" }
   ```

2. Run the project.
3. Copy all four samples into `in-default`, then wait for them to move to `done`:

   ```powershell
   Copy-Item .\file-raw-read\src\main\resources\samples\* "$w\in-default"
   ```

4. Repeat with `in-binary`.
5. Copy only `orders-semicolon.csv` into `in-csv`.

**What to observe.** Each file logs one `META` line and four attempts, tagged with the listener in square brackets.

- `META`: `mimeType`, `class` and `dwType`. Does the extension set the type on a listener with no `outputMimeType`?
- `ATTEMPT-1`, `read(payload.^raw, ...)`: does it return the parsed content? The problems depend on this line.
- `ATTEMPT-2`, the same read again: does a second read return the same content? fl-088 validates the XML before it reads it.
- `ATTEMPT-3`, `read(payload, ...)`: does it fail as the problems say? Note the exact error for a JSON file.
- `ATTEMPT-4`, `payload` directly: for `orders-semicolon.csv` on `in-default`, are the columns split correctly without the separator?
- For `sales_20261103.csv`: is `TRAILER` an ordinary row with `storeId` set to 2?

**Result**

```
                       ATTEMPT-1  ATTEMPT-2  ATTEMPT-3  ATTEMPT-4  mimeType
default  json:                                                     
default  csv (;):                                                  
default  csv (trailer):                                            
default  xml:                                                      
binary   json:                                                     
binary   csv (;):                                                  
binary   csv (trailer):                                            
binary   xml:                                                      
csv-typed csv (;):                                                 
Exact error text of ATTEMPT-3 on JSON:                             
Connector version used:                                            
```

---

## Test 5: sqs-attributes

**Problem:** fl-078

**Goal.** Find out the attribute names on a received message (is `attributes.receiptHandle` right?), the type of the body, and what happens on flow failure with Preserve Messages false and true.

**Why it is uncertain.** The reference gives the source's output as payload String and attributes Object, with no field list for the attributes. Preserve Messages is described as keeping messages after they are read. Nothing covers a failed flow.

### Choose a route

**LocalStack route.** Feasible only if both checks below pass. Try them first, and allow about ten minutes.

1. *The image starts.* LocalStack has required an auth token for its latest releases since March 2026. The compose file pins `4.14.0`, an older tag, and LocalStack's own post describes pinning as a short-term option, but it does not confirm that a given tag runs without a token. Run `docker compose up -d localstack`, then `docker logs studio-localstack`. If it refuses to start without a token, either use the AWS route or sign up for LocalStack's free plan and supply `LOCALSTACK_AUTH_TOKEN` through your own environment, never in a file here.
2. *The connector accepts the endpoint.* The docs confirm a **Custom SQS Endpoint** field on the Basic connection, for non-standard endpoints such as a VPC endpoint. The Studio page calls it **SQS Endpoint**. No docs page gives its XML name, says that a plain `http://` local address works, or mentions LocalStack. So the XML has no such attribute yet. Open the `Sqs_Config` global element, set the field to `http://localhost:4566`, and let Studio write it.

Create the queues, using the `awslocal` command in the container. If `awslocal` is missing, use an AWS CLI on your machine with `--endpoint-url http://localhost:4566`.

```powershell
docker exec studio-localstack awslocal sqs create-queue --queue-name studio-preserve-false
docker exec studio-localstack awslocal sqs create-queue --queue-name studio-preserve-true
```

The URLs in `config.yaml` assume `SQS_ENDPOINT_STRATEGY=path` and account `000000000000`. Compare them with the `QueueUrl` that `create-queue` prints.

To send a message:

```powershell
docker exec studio-localstack awslocal sqs send-message --queue-url http://localhost:4566/queue/us-east-1/000000000000/studio-preserve-true --message-body "FAIL-1"
```

Connector 5.12.5 and later check the queue URL at start-up with `sqs:GetQueueAttributes`, so a start-up failure may come from that check.

**AWS route.** This is the fallback, and it is the more trustworthy of the two because LocalStack is an emulator.

1. In the SQS console, create two Standard queues: `studio-preserve-false` and `studio-preserve-true`.
2. Create an IAM user limited to those two queues, and an access key. Delete both after the test.
3. Put the queue URLs in `config.yaml`. They contain your account id, so do not commit that change.
4. Pass the keys as arguments in the Run Configuration, not in any file: `-Dsqs.accessKey=YOUR_KEY -Dsqs.secretKey=YOUR_SECRET`.
5. Send messages from the console, under **Send and receive messages**.
6. Stop the app when finished, because the sources poll once a second by default. Check the current free-tier limit on the AWS site first.

### Steps

Depth is logged with `curl.exe http://localhost:8095/count`. It may leave out in-flight messages, so compare with the console or `get-queue-attributes`.

1. **Attributes and body.** Send `{"hello":"world"}` to each queue. Read the `BODY`, `BODY-READ`, `ATTR-CLASS`, `ATTR-ALL` and `ATTR-CHECK` lines. If `attributes.receiptHandle` is NULL, note the real name from `ATTR-ALL`, change `vars.receipt` in `inspect-message`, and restart.
2. **Failure, Preserve Messages false.** Send `FAIL-1` to `studio-preserve-false`. Watch for two minutes. Is it received again? Check the depth.
3. **Failure, Preserve Messages true.** Send `FAIL-2` to `studio-preserve-true`. Note the time of each `RECEIVED` line. The default Visibility Timeout is 30 seconds. Purge the queue when finished, because nothing else stops this message returning.
4. **Success with no delete, Preserve Messages true.** Send `KEEP-1`. Is it received again?
5. **Explicit delete.** Send `DELETE-1`. Is `FLOW-OK ... deleted` logged, and does the message stay gone? This proves the receipt handle value is usable.

**Result**

```
Route used (LocalStack or AWS):                           
Custom endpoint attribute Studio wrote (if LocalStack):   
Namespace Studio wrote:                                   
All attribute names (paste ATTR-ALL with values removed): 
Is attributes.receiptHandle right? If not, the real name: 
Body type (BODY line):                                    
read(payload, "application/json") on the body works?      
Preserve false, FAIL: redelivered? Depth afterwards:      
Preserve true, FAIL: redelivered? Interval:               
Preserve true, success with no delete: redelivered?       
DELETE-1 removed the message?                             
Connector version used:                                   
```

---

## Test 6: db-partial-read

**Problem:** inc-072

**Goal.** Find out whether a `db:select` read only as `payload[0]` inside For Each holds connections or cursors until the event ends.

**Why it is uncertain.** The docs describe streaming but do not say when a partly read result is released. inc-072 already carries an accuracy note saying this is a hypothesis. Release notes show this area has changed: 1.10.4 force-closes ResultSets with active LOB streams at the end of a flow, and 1.16.0 fixes unclosed connections. So the answer may depend on the version. Record yours.

**How it is built.** The pool has `maxPoolSize` 2 and `maxWait` 10 seconds. With connections held, the third iteration has nothing to take and should wait 10 seconds and fail. With connections released, the loop finishes quickly. This timing is the evidence, because `pg_stat_activity` cannot tell a checked-out connection from an idle one in the pool.

PostgreSQL has no equivalent of ORA-01000 by default, so the cursor half is measured differently: inside one transaction, with `fetchSize="2"`, the flow counts `pg_cursors` on its own session after each select. The driver keeps a server-side portal only with a fetch size and autocommit off, and each customer's 5 rows exceed the fetch size. The PostgreSQL docs state that `pg_cursors` includes portals created with the protocol's Bind message.

**Steps**

1. `docker compose up -d postgres`. `init.sql` creates 50 customers with 5 rows each. Run the project.
2. Control first:

   ```powershell
   Measure-Command { curl.exe "http://localhost:8096/full?n=5" }
   ```

   This must finish quickly and return `OK`. If it fails, fix that before reading anything into the other results.

3. Partial read below the pool size, then a repeat, to see whether the connections are released when the event ends:

   ```powershell
   curl.exe "http://localhost:8096/partial?n=2"
   curl.exe "http://localhost:8096/partial?n=2"
   ```

4. Partial read above the pool size, and again straight afterwards:

   ```powershell
   Measure-Command { curl.exe "http://localhost:8096/partial?n=5" }
   curl.exe "http://localhost:8096/full?n=2"
   ```

5. The same with `maxRows="1"`:

   ```powershell
   Measure-Command { curl.exe "http://localhost:8096/partial-maxrows?n=5" }
   ```

6. Cursors, with the fully read run first as a baseline:

   ```powershell
   curl.exe "http://localhost:8096/tx-full?n=10"
   curl.exe "http://localhost:8096/tx-partial?n=10"
   ```

7. Optional, during step 4 in a second window:

   ```powershell
   docker exec studio-postgres psql -U studio -d studiotests -c "SELECT pid, state, left(query, 60) FROM pg_stat_activity WHERE application_name = 'studio-db-partial-read'"
   ```

**What to observe**

- `ITER` lines: which iteration stalls, and the gap in the timestamps.
- `FAILED` lines: the iteration, the error type and the description.
- `CURSORS` lines: does `open_cursors` climb by 1 per iteration in `tx-partial` and stay flat in `tx-full`? The count may include the portal of the counting query, so compare the two runs and do not read the absolute number. If it stays flat in both runs, the measurement may simply not be seeing portals, so the result is inconclusive rather than a no.
- Whether a request succeeds right after a failed one, which shows that the connections were returned.

**Result**

```
db connector version:                                     
/full?n=5 (control) time and outcome:                     
/partial?n=2 twice: second call OK?                       
/partial?n=5: outcome, failing iteration, error type:     
Request right after it succeeded?                         
/partial-maxrows?n=5: outcome, failing iteration:         
tx-full open_cursors, first and last iteration:           
tx-partial open_cursors, first and last iteration:        
Conclusion: connections held until event end?             
Conclusion: cursors held until event end?                 
```

---

## Results table

Fill this in and paste it back. The right-hand column shows which problems each answer affects.

| # | Question | Answer | Evidence (log line or command output) | Depends on this |
|---|---|---|---|---|
| 1a | IMAP, no matcher: is a read email dispatched? | | | inc-075, ms-081, fl-079 |
| 1b | IMAP, `seen` INCLUDE: is a read email dispatched? | | | inc-075, ms-081 |
| 1c | Which `seen` value retrieves read mail? (optional) | | | inc-075, ms-081 |
| 1d | Is an email moved back to INBOX dispatched? (optional) | | | fl-079 |
| 2a | MANUAL, no Commit: are later records received? | | | inc-078 |
| 2b | MANUAL: where does a restart resume? | | | inc-078 |
| 2c | MANUAL, nothing ever committed: is the record seen after restart? | | | inc-078 |
| 2d | AUTO, failed flow: is the record delivered again, and when? | | | fl-077 |
| 2e | AUTO: does a later success commit past the failed record? | | | fl-077 |
| 3a | Batch: can the handler read `vars.records` a second time? | | | fl-082 |
| 3b | Batch: does the text copy work as a fallback? | | | fl-082 |
| 3c | Batch: commit key expression that worked | | | fl-082 |
| 4a | `read(payload.^raw, ...)` on JSON, CSV, XML: works? | | | fl-086, fl-087, fl-088 |
| 4b | `read(payload, ...)`: does it fail, and for which formats? | | | fl-086, fl-087, fl-088 |
| 4c | Can `payload.^raw` be read twice in a flow? | | | fl-088 |
| 4d | Effect of `outputMimeType` on the listener | | | fl-086 |
| 5a | SQS attribute names; is `attributes.receiptHandle` right? | | | fl-078 |
| 5b | SQS body type; does `read(payload, ...)` work? | | | fl-078 |
| 5c | Preserve Messages false, flow fails: what happens? | | | fl-078 |
| 5d | Preserve Messages true, flow fails: what happens? | | | fl-078 |
| 6a | `payload[0]`, no transaction: are connections held until the event ends? | | | inc-072 |
| 6b | Does `maxRows="1"` change that? | | | inc-072 |
| 6c | `payload[0]` in a transaction: are cursors held until the event ends? | | | inc-072 |

Also paste back the correct name for every item below that turned out different.

| Item | Correct name or value | 
|---|---|
| `ackMode` on the Kafka listeners | |
| `consumerCommitKey` on `kafka:commit` | |
| `preserveMessages` and `queueUrl` on `sqs:receivemessages` | |
| `receiptHandle` on `sqs:delete-message` | |
| SQS namespace | |
| Connector versions that resolved | |

## Unconfirmed items

Each of these is marked `TODO verify in Studio` in the file named, except the JSON and compose items, which cannot carry an XML comment.

| Item | File | Why it is unconfirmed |
|---|---|---|
| `ackMode` attribute | Kafka XML in tests 2 and 3 | The reference gives the display name Acknowledgement mode only |
| `consumerCommitKey` attribute | Kafka XML in tests 2 and 3 | The reference gives the display name Consumer commit key only |
| `attributes.consumerCommitKey` | Kafka XML in tests 2 and 3 | The field is documented, but no expression is shown, and on the batch listener it sits in Consumer Context |
| `outputMimeType` on `file:listener` | `file-raw-read.xml` | The field is listed on the source, but the XML name is shown only on `file:read` |
| Namespace `mule/sqs` or `mule/amazon-sqs` | `sqs-attributes.xml` | The docs page gives both |
| `region` value format | `sqs-attributes.xml` | Examples show `us-east-1`, the reference shows `US_EAST_1` |
| Custom SQS Endpoint attribute | `sqs-attributes.xml` | No XML name in the docs, so it is left out and set through Studio |
| `queueUrl`, `preserveMessages` on the source | `sqs-attributes.xml` | Display names only. `queueUrl` is shown in XML on another operation |
| `receiptHandle`, `queueUrl` on `sqs:delete-message` | `sqs-attributes.xml` | Display names only |
| `watermark` or `watermarkEnabled` | `imap-read-filter.xml` | The docs example and the 1.8.0 plugin descriptor differ, so the attribute is left out |
| `sourceFolder` on `email:move-to-folder` | `imap-read-filter.xml` | In the 1.8.0 plugin descriptor but not in the docs XML |
| `db:query-single` tag | `db-partial-read.xml` | Docs and descriptor name the operation, and the hyphenated tag is inferred |
| Runtime and plugin versions | every `pom.xml`, `mule-artifact.json` | Copied from your other projects, not from the docs |
| LocalStack `4.14.0` running with no token, and `awslocal` being in the image | `docker-compose.yml`, this README | The tag exists, but neither point is confirmed |

Sources for versions: Kafka 4.15.4, SQS 5.12.12, Email 1.8.0, File 1.5.6 and Database 1.16.2 all appear in the MuleSoft release notes. File 1.5.7 and Database 1.16.6 are newer, and the older two were chosen because they are already in your local Maven repository. HTTP 1.11.3 and PostgreSQL driver 42.7.11 also come from your local repository.
