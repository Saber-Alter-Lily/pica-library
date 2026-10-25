function Assert-PicaBuildCheckoutRoot {
    param([Parameter(Mandatory = $true)][string]$Root)
    $inside = [string](& git -C $Root rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') {
        throw 'Build source must be an actual Git working-tree root'
    }
    $prefix = [string](& git -C $Root rev-parse --show-prefix 2>$null)
    if ($LASTEXITCODE -ne 0 -or $prefix.Length -ne 0) {
        throw 'Build source must be an actual Git working-tree root, not a nested source snapshot'
    }
}
