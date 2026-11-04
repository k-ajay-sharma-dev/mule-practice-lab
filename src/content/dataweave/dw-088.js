export default {
  id: 'dw-088',
  category: 'dataweave',
  title: 'Map a Workday Get_Workers Response to Identity Records',
  level: 'INTERMEDIATE',
  tags: ['workday', 'xml', 'namespaces', 'attributes', 'json', 'hr'],
  estMinutes: 25,
  description: `
The Workday connector's Human Resources operation returns a \`Get_Workers\` response as XML. The identity platform needs JSON. The sample is a simplified version of the Workday structure, and every element is in the namespace \`urn:com.workday/bsvc\`.

**Rules**
- Output \`{ "workers": [...] }\`, one object per \`Worker\`. It is an empty array when there are no workers.
- \`workerId\`: the \`ID\` under \`Worker_Reference\` whose \`type\` attribute is \`Employee_ID\`. If there is none, use the one of type \`Contingent_Worker_ID\`.
- \`workerType\`: \`EMPLOYEE\` or \`CONTINGENT\`, depending on which ID was used.
- \`firstName\` and \`lastName\` come from \`Name_Detail_Data\`.
- \`email\`: the \`Email_Address\` of the \`Email_Address_Data\` whose \`Usage_Type\` is \`WORK\`, or \`null\` if there is none. A worker can have several addresses.
- \`jobTitle\`: \`Business_Title\` from the \`Position_Data\`.
- \`active\`: a boolean, where \`Active\` value \`1\` is \`true\`.
- \`hireDate\`: Workday adds a time zone offset to dates (\`2021-03-01-08:00\`). Output only \`yyyy-MM-dd\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<wd:Get_Workers_Response xmlns:wd="urn:com.workday/bsvc" wd:version="v44.0">
  <wd:Response_Data>
    <wd:Worker>
      <wd:Worker_Reference>
        <wd:ID wd:type="WID">9f3c1e77a1b24d10</wd:ID>
        <wd:ID wd:type="Employee_ID">21001</wd:ID>
      </wd:Worker_Reference>
      <wd:Worker_Data>
        <wd:Personal_Data>
          <wd:Name_Detail_Data>
            <wd:First_Name>Maya</wd:First_Name>
            <wd:Last_Name>Okafor</wd:Last_Name>
          </wd:Name_Detail_Data>
          <wd:Contact_Data>
            <wd:Email_Address_Data>
              <wd:Email_Address>maya.o@example.net</wd:Email_Address>
              <wd:Usage_Type>HOME</wd:Usage_Type>
            </wd:Email_Address_Data>
            <wd:Email_Address_Data>
              <wd:Email_Address>maya.okafor@northcare.example</wd:Email_Address>
              <wd:Usage_Type>WORK</wd:Usage_Type>
            </wd:Email_Address_Data>
          </wd:Contact_Data>
        </wd:Personal_Data>
        <wd:Employment_Data>
          <wd:Position_Data>
            <wd:Business_Title>Senior Nurse</wd:Business_Title>
          </wd:Position_Data>
          <wd:Worker_Status_Data>
            <wd:Active>1</wd:Active>
            <wd:Hire_Date>2021-03-01-08:00</wd:Hire_Date>
          </wd:Worker_Status_Data>
        </wd:Employment_Data>
      </wd:Worker_Data>
    </wd:Worker>
    <wd:Worker>
      <wd:Worker_Reference>
        <wd:ID wd:type="WID">27ab90d4c3e84f55</wd:ID>
        <wd:ID wd:type="Contingent_Worker_ID">C-3307</wd:ID>
      </wd:Worker_Reference>
      <wd:Worker_Data>
        <wd:Personal_Data>
          <wd:Name_Detail_Data>
            <wd:First_Name>Tom</wd:First_Name>
            <wd:Last_Name>Lindqvist</wd:Last_Name>
          </wd:Name_Detail_Data>
          <wd:Contact_Data>
            <wd:Email_Address_Data>
              <wd:Email_Address>tom.l@example.org</wd:Email_Address>
              <wd:Usage_Type>HOME</wd:Usage_Type>
            </wd:Email_Address_Data>
          </wd:Contact_Data>
        </wd:Personal_Data>
        <wd:Employment_Data>
          <wd:Position_Data>
            <wd:Business_Title>IT Contractor</wd:Business_Title>
          </wd:Position_Data>
          <wd:Worker_Status_Data>
            <wd:Active>0</wd:Active>
            <wd:Hire_Date>2024-09-16+01:00</wd:Hire_Date>
          </wd:Worker_Status_Data>
        </wd:Employment_Data>
      </wd:Worker_Data>
    </wd:Worker>
  </wd:Response_Data>
</wd:Get_Workers_Response>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "workers": [
    {
      "workerId": "21001",
      "workerType": "EMPLOYEE",
      "firstName": "Maya",
      "lastName": "Okafor",
      "email": "maya.okafor@northcare.example",
      "jobTitle": "Senior Nurse",
      "active": true,
      "hireDate": "2021-03-01"
    },
    {
      "workerId": "C-3307",
      "workerType": "CONTINGENT",
      "firstName": "Tom",
      "lastName": "Lindqvist",
      "email": null,
      "jobTitle": "IT Contractor",
      "active": false,
      "hireDate": "2024-09-16"
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
ns wd urn:com.workday/bsvc
---
payload
`,
  hints: [
    'Declare the namespace with `ns wd urn:com.workday/bsvc` and select with `wd#Worker`.',
    'Use the multi-value selector for anything that repeats: `.*wd#Worker`, `.*wd#ID`, `.*wd#Email_Address_Data`.',
    'A namespaced attribute is read with `@wd#type`. Filter the IDs by that attribute.',
    'A small function that returns the ID of a given type keeps the mapping readable.',
    'The first 10 characters of the date are the date itself: `value[0 to 9]`.',
  ],
  solution: `%dw 2.0
output application/json
ns wd urn:com.workday/bsvc
fun idOfType(worker, idType) =
  ((worker.wd#Worker_Reference.*wd#ID default []) filter ((id) -> id.@wd#'type' == idType))[0]
var workers = payload.wd#Get_Workers_Response.wd#Response_Data.*wd#Worker default []
---
{
  workers: workers map (w) -> do {
    var employeeId = idOfType(w, "Employee_ID")
    var data = w.wd#Worker_Data
    var personal = data.wd#Personal_Data
    var employment = data.wd#Employment_Data
    var emails = personal.wd#Contact_Data.*wd#Email_Address_Data default []
    ---
    {
      workerId: employeeId default idOfType(w, "Contingent_Worker_ID"),
      workerType: if (employeeId != null) "EMPLOYEE" else "CONTINGENT",
      firstName: personal.wd#Name_Detail_Data.wd#First_Name,
      lastName: personal.wd#Name_Detail_Data.wd#Last_Name,
      email: (emails filter ((e) -> e.wd#Usage_Type == "WORK"))[0].wd#Email_Address,
      jobTitle: employment.wd#Position_Data.wd#Business_Title,
      active: employment.wd#Worker_Status_Data.wd#Active == "1",
      hireDate: employment.wd#Worker_Status_Data.wd#Hire_Date[0 to 9]
    }
  }
}`,
  explanation: `
**Namespaces.** Every Workday element is in \`urn:com.workday/bsvc\`, so declare \`ns wd\` and select with \`wd#\`. The same applies to the attribute: \`@wd#'type'\`. The word \`type\` is quoted, as in the connector's own examples.

**Typed IDs.** Workday returns several IDs for one reference, and their order is not part of the contract. Always choose by the \`type\` attribute. Taking the first \`ID\` here would give the WID, not the employee number.

**Repeating elements.** A worker can have any number of email addresses, so \`.*wd#Email_Address_Data\` plus a filter is safe. Indexing an empty array gives \`null\`, so the selector after \`[0]\` returns \`null\` when there is no work address.

**Dates with offsets.** \`2021-03-01-08:00\` is a date with a time zone offset and is not a standard \`Date\` string. The required output is the date itself, so a slice is the simplest correct solution.

**\`do\` block.** It keeps the local variables for one worker next to the mapping that uses them.
`,
  tests: [
    {
      name: 'No workers in the response',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: '<wd:Get_Workers_Response xmlns:wd="urn:com.workday/bsvc" wd:version="v44.0"><wd:Response_Data></wd:Response_Data></wd:Get_Workers_Response>',
        },
      ],
      expected: '{ "workers": [] }',
    },
    {
      name: 'One worker with the WID last and no email data',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<wd:Get_Workers_Response xmlns:wd="urn:com.workday/bsvc"><wd:Response_Data><wd:Worker><wd:Worker_Reference><wd:ID wd:type="Employee_ID">30500</wd:ID><wd:ID wd:type="WID">aa11</wd:ID></wd:Worker_Reference><wd:Worker_Data><wd:Personal_Data><wd:Name_Detail_Data><wd:First_Name>Ines</wd:First_Name><wd:Last_Name>Costa</wd:Last_Name></wd:Name_Detail_Data></wd:Personal_Data><wd:Employment_Data><wd:Position_Data><wd:Business_Title>Pharmacist</wd:Business_Title></wd:Position_Data><wd:Worker_Status_Data><wd:Active>1</wd:Active><wd:Hire_Date>2019-11-04Z</wd:Hire_Date></wd:Worker_Status_Data></wd:Employment_Data></wd:Worker_Data></wd:Worker></wd:Response_Data></wd:Get_Workers_Response>',
        },
      ],
      expected:
        '{ "workers": [ { "workerId": "30500", "workerType": "EMPLOYEE", "firstName": "Ines", "lastName": "Costa", "email": null, "jobTitle": "Pharmacist", "active": true, "hireDate": "2019-11-04" } ] }',
    },
  ],
  followUps: [
    {
      q: 'The connector output is binary. How does Mule know it is XML in a Transform Message?',
      a: 'Check the MIME type on the message. If it is not set to XML, use `read(payload, "application/xml")` or set the output MIME type on the operation.',
    },
    {
      q: 'Why not parse the hire date to a Date?',
      a: 'You could, with a format that includes the offset, but the output only needs the calendar date. Converting through a time zone could also shift the day, so keeping the date part is safer here.',
    },
  ],
}
