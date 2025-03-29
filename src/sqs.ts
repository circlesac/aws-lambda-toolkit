import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs"
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts"
import { $trycatch } from "@tszen/trycatch"
import { SQSEvent, SQSHandler } from "aws-lambda"

export async function Account() {
	const sts = new STSClient()
	const { Account } = await sts.send(new GetCallerIdentityCommand({}))
	return Account
}

export function QueueUrl(region: string, accountId: string, queueName: string) {
	if (accountId === "000000000000") {
		return `http://sqs.${region}.localhost.localstack.cloud:4566/${accountId}/${queueName}`
	}
	return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`
}

export class SQSProcessor {
	static handler<P>(process: (payload: P) => void | Promise<void>) {
		const handler: SQSHandler = async (event: SQSEvent) => {
			const region = event.Records[0]?.awsRegion
			const sqs = new SQSClient({ region })

			for (const record of event.Records) {
				console.debug("Processing record=", record)
				try {
					// eslint-disable-next-line prefer-const
					let [payload, err] = $trycatch(() => JSON.parse(record.body))
					if (err) payload = record.body as P

					await process(payload as P)

					if (record.receiptHandle) {
						const [, accountId, queueName] = record.eventSourceARN.replace("arn:aws:sqs:", "").split(":")
						await sqs.send(
							new DeleteMessageCommand({
								QueueUrl: QueueUrl(region, accountId, queueName),
								ReceiptHandle: record.receiptHandle
							})
						)
					}
				} catch (error) {
					console.error("Error processing record", record, error)
				}
			}
		}
		return handler
	}
}
