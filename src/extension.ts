// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs from "fs";
import path from "path";
import OpenAI from 'openai';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

// deepseek
const deepSeekConfig = {
	key: 'sk-aaacc1072f644cf6b388b1a7bca4e758',
	model: "deepseek-chat" as 'deepseek-chat' | 'deepseek-reasoner'
}

const deepseek = new OpenAI({
	baseURL: 'https://api.deepseek.com',
	apiKey: deepSeekConfig.key
});

const translatePrompt: OpenAI.Chat.Completions.ChatCompletionMessageParam = {

	role: 'system', content: `
		- 你能够为我提供精准、专业的翻译服务。
		- 你还能根据我的需求,为我讲解不同语言之间的语法差异和文化背景,帮助我更好地理解翻译内容。
		- 你不能回答和翻译无关的内容
		- 输入: 我输入的数据他可能需要翻译的内容,这段数据可能是数组,可能是对象,也可能是文字;如果输入是数组或者对象需要将每一项作为一个整体输入,例如["a b"]这里的"a b"是一个整体,不需要拆开除此之外任何例如" /,/./、"等都视为分隔;
		- 输出: 生成结果是纯文本,能直接复制到js文件中运行;不要以markdown格式输出;输出结果模板如下:'#输出的语言类型 \n"a":"b",#end';a是翻译原文,b是翻译结果,最后一行无需",";就算同种语言（比如中文->中文）也要输出结果(输出结果和输入内容一致);不许出现与上述无关的任何回答;
	`
}

// const toArrayPrompt: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
// 	role: 'system', content: `

// 	- 你不能回答和转换内容无关的内容
// 	- 将出去的数据以','分割,输出结果去重,不需要以markdown格式输出`}

// const toFormatePrompt: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
// 	role: 'system', content: `
// 	- 将输入按照js代码格式化
// 	- 你不能回答和转换内容无关的内容
// 	- 输出格式与输入格式一致,只改变格式化;不要以markdown格式输出;生成结果是纯文本,能直接复制到js文件中运行;`}

const completion = deepseek.chat.completions

export async function activate(context: vscode.ExtensionContext) {

	const disposable = vscode.commands.registerCommand('i18n-ai.translate', async () => {
		try {
			// 获取添加语言的文件路径
			const basePath: string | undefined = vscode.workspace.getConfiguration().get('i18n-ai.baseLangPath')
			const translateLangObject: any = vscode.workspace.getConfiguration().get('i18n-ai.translateLang')
			// 引导配置
			if (!basePath) {
				const selected = await vscode.window.showInformationMessage(
					'您未配置baseLangPath输入文件路径，是否进行设置？',
					{ modal: true }, // 设置为模态对话框
					'确定',
				);
				if (selected === '确定') {
					const uri = await vscode.window.showOpenDialog()
					if (!uri) {
						throw new Error('请手动完成配置')
					}
					await vscode.workspace.getConfiguration().update('i18n-ai.baseLangPath', uri?.[0].fsPath, vscode.ConfigurationTarget.Global);
				} else throw new Error('请手动完成配置')
			}
			if (Object.keys(translateLangObject).length === 0) {
				const selected = await vscode.window.showInformationMessage(
					'您未配置translateLang输出文件路径，是否进行设置？',
					{ modal: true }, // 设置为模态对话框
					'确定',
				);
				if (selected === '确定') {
					const uri = await vscode.window.showOpenDialog()
					if (!uri) {
						throw new Error('请手动完成配置')
					}
					const key = await vscode.window.showInputBox({ title: '请输入翻译语言', prompt: '例如：中文', validateInput(v) { return v ? '' : '不能为空' } }) ?? ''
					await vscode.workspace.getConfiguration().update('i18n-ai.translateLang', { [key]: uri?.[0].fsPath }, vscode.ConfigurationTarget.Global);
				} else throw new Error('请手动完成配置')
			}
			// restart
			if (!basePath || Object.keys(translateLangObject).length === 0) {
				await vscode.commands.executeCommand('i18n-ai.translate');
				return
			}
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: '翻译中...',
			}, async (progress, token) => {
				try {
					// 需要翻译的语言
					const file = fs.readFileSync(basePath!, 'utf-8',);
					if (!file) throw new Error('请配置baseLangPath或者配置翻译内容')
					let langStr = `${file}; 翻译成：`
					for (const key in translateLangObject) {
						langStr += key + ','
					}
					// 翻译
					const res = await completion.create({ messages: [translatePrompt, { role: 'user', content: langStr }], model: deepSeekConfig.model })
					const message = res.choices[0].message.content ?? ''
					for (const key in translateLangObject) {
						const path = translateLangObject[key]; //当前路径
						const data = message.split('#' + key)[1].split('#end')[0]
						// 读取文件和处理文本格式
						const oldfile = fs.readFileSync(path, 'utf-8') ?? ''
						const split1 = oldfile.split('{')
						const split2 = split1[1]?.split('}') ?? ''
						let oldContent = split2[0] || ''
						// 保证每行都有“,”分隔
						const lines = oldContent.split('\n');
						const newLines = lines.map(line => {
							// 如果行不为空且最后一个字符不是逗号
							if (line.trim() !== '' && line[line.length - 1] !== ',') {
								return line + ',';
							}
							return line;
						});
						const result = newLines.join('\n');
						// 处理字符
						const writeRes = (split1[0] || '') + '{' + result + data + '\n}' + (split2[1] || '')
						const deleteFeed = writeRes.replace(/^\s*\n/gm, '');
						// 写入结果
						fs.writeFileSync(path, deleteFeed ?? '',)
					}
					progress.report({ increment: 100 })
					vscode.window.showInformationMessage('翻译完成');
					fs.writeFileSync(basePath!, '',)
				} catch (error) {
					vscode.window.showErrorMessage('翻译失败：' + error);
					progress.report({ increment: 100 })
				}
			})
		}
		catch (error) {
			vscode.window.showErrorMessage('失败：' + error);
		}
	});

	context.subscriptions.push(disposable);
}


// This method is called when your extension is deactivated
export function deactivate() { }
