import fs from 'node:fs'

const base = 'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'
const testBase = 'mobile/android-alpha2/app/src/test/java/com/picalibrary/android/'

function requireText(file, expected) {
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes(expected)) {
        throw new Error(`Mobile shell contract mismatch in ${file}: expected ${expected}`)
    }
}

requireText(
    base + 'ShellPolicy.java',
    'private static final String[] BOTTOM_TABS={"书库","推荐","在线","连接"};'
)
requireText(
    testBase + 'ShellPolicyTest.java',
    'assertArrayEquals(new String[]{"书库","推荐","在线","连接"},ShellPolicy.bottomTabs());'
)
requireText(
    testBase + 'Alpha8ProductContractTest.java',
    'assertArrayEquals(new String[]{"书库","推荐","在线","连接"}, ShellPolicy.bottomTabs());'
)

console.log('alpha8 mobile shell contract verified: 书库 / 推荐 / 在线 / 连接; no history tab')
