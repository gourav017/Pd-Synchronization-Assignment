# Edge Cases & How They're Handled
1. Missing env variables
If PIPEDRIVE_API_KEY or PIPEDRIVE_COMPANY_DOMAIN is not set, the function throws before making any API call. No weird 401 errors from Pipedrive.
2. No name mapping in mappings.json
The sync needs a name to search Pipedrive first. If there's no pipedriveKey: "name" entry, it throws early. Prevents accidental duplicate records.
3. Name value is empty in inputData
The name mapping exists but the actual value is "" or missing — throws with a message showing what it found. You don't want a Pipedrive person with a blank name.
4. Wrong inputKey path
If inputKey is "phoneNumber.mobile" but inputData only has "phoneNumber.home", that field gets skipped with a warning and the rest of the mappings still run fine.
5. Nested path hits null mid-way
If a path like "contact.details.phone" exists in mappings but contact is null in inputData, it catches it instead of throwing a Cannot read properties of null error. Field is skipped, everything else continues.
6. Pipedrive API errors
Every API call checks response.ok. If Pipedrive returns a 4xx or 5xx, it reads the actual error body and throws with the status + message. Way easier to debug than a generic parse error.