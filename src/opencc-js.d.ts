declare module 'opencc-js/t2cn' {
    export function Converter(options: { from: 't'; to: 'cn' }): (text: string) => string
}
