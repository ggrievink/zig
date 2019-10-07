(function() {
    var domStatus = document.getElementById("status");
    var domSectNav = document.getElementById("sectNav");
    var domListNav = document.getElementById("listNav");
    var domSectPkgs = document.getElementById("sectPkgs");
    var domListPkgs = document.getElementById("listPkgs");
    var domSectTypes = document.getElementById("sectTypes");
    var domListTypes = document.getElementById("listTypes");
    var domSectFns = document.getElementById("sectFns");
    var domListFns = document.getElementById("listFns");
    var domFnProto = document.getElementById("fnProto");
    var domFnProtoCode = document.getElementById("fnProtoCode");
    var domFnDocs = document.getElementById("fnDocs");
    var domSearch = document.getElementById("search");
    var domSectSearchResults = document.getElementById("sectSearchResults");
    var domListSearchResults = document.getElementById("listSearchResults");
    var domSectSearchNoResults = document.getElementById("sectSearchNoResults");
    var domSectInfo = document.getElementById("sectInfo");
    var domListInfo = document.getElementById("listInfo");
    var domTdTarget = document.getElementById("tdTarget");
    var domTdZigVer = document.getElementById("tdZigVer");
    var domHdrName = document.getElementById("hdrName");

    var searchTimer = null;
    var escapeHtmlReplacements = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

    var typeKindTypeId;
    var typeKindFnId;
    findTypeKinds();

    // for each package, is an array with packages to get to this one
    var canonPkgPaths = computeCanonicalPackagePaths();

    var curNav = {
        // each element is a package name, e.g. @import("a") then within there @import("b")
        // starting implicitly from root package
        pkgNames: [],
        // same as above except actual packages, not names
        pkgObjs: [],
        // Each element is a decl name, `a.b.c`, a is 0, b is 1, c is 2, etc.
        // empty array means refers to the package itself
        declNames: [],
        // these will be all types, except the last one may be a type or a decl
        declObjs: [],
    };
    var curNavSearch = "";

    var rootIsStd = detectRootIsStd();
    var typeTypeId = findTypeTypeId();
    domSearch.addEventListener('keydown', onSearchKeyDown, false);
    window.addEventListener('hashchange', onHashChange, false);
    window.addEventListener('keydown', onWindowKeyDown, false);
    onHashChange();

    function renderTitle() {
        var list = curNav.pkgNames.concat(curNav.declNames);
        var suffix = " - Zig";
        if (list.length === 0) {
            if (rootIsStd) {
                document.title = "std" + suffix;
            } else {
                document.title = zigAnalysis.params.rootName + suffix;
            }
        } else {
            document.title = list.join('.') + suffix;
        }
    }

    function render() {
        domStatus.classList.add("hidden");
        domFnProto.classList.add("hidden");
        domFnDocs.classList.add("hidden");
        domSectPkgs.classList.add("hidden");
        domSectTypes.classList.add("hidden");
        domSectFns.classList.add("hidden");
        domSectSearchResults.classList.add("hidden");
        domSectSearchNoResults.classList.add("hidden");
        domSectInfo.classList.add("hidden");
        domHdrName.classList.add("hidden");

        renderTitle();
        renderInfo();
        renderPkgList();

        if (curNavSearch !== "") {
            return renderSearch();
        }

        var rootPkg = zigAnalysis.packages[zigAnalysis.rootPkg];
        var pkg = rootPkg;
        curNav.pkgObjs = [pkg];
        for (var i = 0; i < curNav.pkgNames.length; i += 1) {
            var childPkg = zigAnalysis.packages[pkg.table[curNav.pkgNames[i]]];
            if (childPkg == null) {
                return render404();
            }
            pkg = childPkg;
            curNav.pkgObjs.push(pkg);
        }

        var decl = zigAnalysis.types[pkg.main];
        curNav.declObjs = [decl];
        for (var i = 0; i < curNav.declNames.length; i += 1) {
            var childDecl = findSubDecl(decl, curNav.declNames[i]);
            if (childDecl == null) {
                return render404();
            }
            var container = getDeclContainerType(childDecl);
            if (container == null) {
                if (i + 1 === curNav.declNames.length) {
                    curNav.declObjs.push(childDecl);
                    break;
                } else {
                    return render404();
                }
            }
            decl = container;
            curNav.declObjs.push(decl);
        }

        renderNav();

        var lastDecl = curNav.declObjs[curNav.declObjs.length - 1];
        if (lastDecl.type != null) {
            var typeObj = zigAnalysis.types[lastDecl.type];
            if (typeObj.kind === typeKindFnId) {
                return renderFn(lastDecl);
            }
            throw new Error("docs for this decl which is not a container");
        }
        renderType(lastDecl);
        if (lastDecl.pubDecls != null) {
            renderContainer(lastDecl);
        }
    }

    function renderFn(fnDecl) {
        var typeObj = zigAnalysis.types[fnDecl.type];
        domFnProtoCode.textContent = "fn " + fnDecl.name + typeObj.name.substring(2);

        var srcNode = zigAnalysis.astNodes[fnDecl.src];
        if (srcNode.docs != null) {
            domFnDocs.innerHTML = markdown(srcNode.docs);
            domFnDocs.classList.remove("hidden");
        }

        domFnProto.classList.remove("hidden");
    }

    function renderNav() {
        var len = curNav.pkgNames.length + curNav.declNames.length;
        resizeDomList(domListNav, len, '<li><a href="#"></a></li>');
        var list = [];
        var hrefPkgNames = [];
        var hrefDeclNames = [];
        for (var i = 0; i < curNav.pkgNames.length; i += 1) {
            hrefPkgNames.push(curNav.pkgNames[i]);
            list.push({
                name: curNav.pkgNames[i],
                link: navLink(hrefPkgNames, hrefDeclNames),
            });
        }
        for (var i = 0; i < curNav.declNames.length; i += 1) {
            hrefDeclNames.push(curNav.declNames[i]);
            list.push({
                name: curNav.declNames[i],
                link: navLink(hrefPkgNames, hrefDeclNames),
            });
        }

        for (var i = 0; i < list.length; i += 1) {
            var liDom = domListNav.children[i];
            var aDom = liDom.children[0];
            aDom.textContent = list[i].name;
            aDom.setAttribute('href', list[i].link);
            if (i + 1 == list.length) {
                aDom.classList.add("active");
            } else {
                aDom.classList.remove("active");
            }
        }

        domSectNav.classList.remove("hidden");
    }

    function renderInfo() {
        domTdZigVer.textContent = zigAnalysis.params.zigVersion;
        domTdTarget.textContent = zigAnalysis.params.target;

        domSectInfo.classList.remove("hidden");
    }

    function render404() {
        domStatus.textContent = "404 Not Found";
        domStatus.classList.remove("hidden");
    }

    function renderPkgList() {
        var rootPkg = zigAnalysis.packages[zigAnalysis.rootPkg];
        var list = [];
        for (var key in rootPkg.table) {
            if (key === "root" && rootIsStd) continue;
            list.push({
                name: key,
                pkg: rootPkg.table[key],
            });
        }
        list.sort(function(a, b) {
            return operatorCompare(a.name.toLowerCase(), b.name.toLowerCase());
        });

        if (list.length !== 0) {
            resizeDomList(domListPkgs, list.length, '<li><a href="#"></a></li>');
            for (var i = 0; i < list.length; i += 1) {
                var liDom = domListPkgs.children[i];
                var aDom = liDom.children[0];
                aDom.textContent = list[i].name;
                aDom.setAttribute('href', navLinkPkg(list[i].pkg));
            }

            domSectPkgs.classList.remove("hidden");
        }
    }

    function navLink(pkgNames, declNames) {
        if (pkgNames.length === 0 && declNames.length === 0) {
            return '#';
        } else if (declNames.length === 0) {
            return '#' + pkgNames.join('.');
        } else {
            return '#' + pkgNames.join('.') + ';' + declNames.join('.');
        }
    }

    function navLinkPkg(pkgIndex) {
        return navLink(canonPkgPaths[pkgIndex], []);
    }

    function navLinkDecl(childName) {
        return navLink(curNav.pkgNames, curNav.declNames.concat([childName]));
    }

    function resizeDomList(listDom, desiredLen, templateHtml) {
        // add the missing dom entries
        var i, ev;
        for (i = listDom.childElementCount; i < desiredLen; i += 1) {
            listDom.insertAdjacentHTML('beforeend', templateHtml);
        }
        // remove extra dom entries
        while (desiredLen < listDom.childElementCount) {
            listDom.removeChild(listDom.lastChild);
        }
    }

    function renderType(typeObj) {
        if (typeObj.name != null && typeObj.name != "") {
            domHdrName.innerText = zigAnalysis.typeKinds[typeObj.kind] + " " + typeObj.name;
            domHdrName.classList.remove("hidden");
        }
    }

    function renderContainer(container) {
        var typesList = [];
        var fnsList = [];
        for (var i = 0; i < container.pubDecls.length; i += 1) {
            var decl = zigAnalysis.decls[container.pubDecls[i]];
            if (decl.type != null) {
                if (decl.type == typeTypeId) {
                    typesList.push(decl);
                } else {
                    var typeKind = zigAnalysis.types[decl.type].kind;
                    if (typeKind === typeKindFnId) {
                        fnsList.push(decl);
                    }
                }
            }
        }
        typesList.sort(function(a, b) {
            return operatorCompare(a.name.toLowerCase(), b.name.toLowerCase());
        });
        fnsList.sort(function(a, b) {
            return operatorCompare(a.name.toLowerCase(), b.name.toLowerCase());
        });

        if (typesList.length !== 0) {
            resizeDomList(domListTypes, typesList.length, '<li><a href="#"></a></li>');
            for (var i = 0; i < typesList.length; i += 1) {
                var liDom = domListTypes.children[i];
                var aDom = liDom.children[0];
                var decl = typesList[i];
                aDom.textContent = decl.name;
                aDom.setAttribute('href', navLinkDecl(decl.name));
            }
            domSectTypes.classList.remove("hidden");
        }

        if (fnsList.length !== 0) {
            resizeDomList(domListFns, fnsList.length, '<li><a href="#"></a></li>');
            for (var i = 0; i < fnsList.length; i += 1) {
                var liDom = domListFns.children[i];
                var aDom = liDom.children[0];
                var decl = fnsList[i];
                aDom.textContent = decl.name;
                aDom.setAttribute('href', navLinkDecl(decl.name));
            }
            domSectFns.classList.remove("hidden");
        }
    }

    function operatorCompare(a, b) {
        if (a === b) {
            return 0;
        } else if (a < b) {
            return -1;
        } else {
            return 1;
        }
    }

    function detectRootIsStd() {
        var rootPkg = zigAnalysis.packages[zigAnalysis.rootPkg];
        if (rootPkg.table["std"] == null) {
            // no std mapped into the root package
            return false;
        }
        var stdPkg = zigAnalysis.packages[rootPkg.table["std"]];
        return rootPkg.file === stdPkg.file;
    }

    function findTypeKinds() {
        for (var i = 0; i < zigAnalysis.typeKinds.length; i += 1) {
            if (zigAnalysis.typeKinds[i] === "Type") {
                typeKindTypeId = i;
            } else if (zigAnalysis.typeKinds[i] === "Fn") {
                typeKindFnId = i;
            }
        }
        if (typeKindTypeId == null) {
            throw new Error("No type kind 'Type' found");
        }
        if (typeKindFnId == null) {
            throw new Error("No type kind 'Fn' found");
        }
    }

    function findTypeTypeId() {
        for (var i = 0; i < zigAnalysis.types.length; i += 1) {
            if (zigAnalysis.types[i].kind == typeKindTypeId) {
                return i;
            }
        }
        throw new Error("No type 'type' found");
    }

    function onHashChange() {
        curNav = {
            pkgNames: [],
            pkgObjs: [],
            declNames: [],
            declObjs: [],
        };
        curNavSearch = "";

        if (location.hash[0] === '#' && location.hash.length > 1) {
            var nonSearchAndSearchParts = location.hash.substring(1).split("?");
            var nonSearchPart;
            if (nonSearchAndSearchParts.length === 1) {
                nonSearchPart = nonSearchAndSearchParts[0];
            } else {
                nonSearchPart = nonSearchAndSearchParts[0];
                curNavSearch = decodeURIComponent(nonSearchAndSearchParts[1]);
            }

            var parts = nonSearchPart.split(";");
            curNav.pkgNames = decodeURIComponent(parts[0]).split(".");
            if (parts[1] != null) {
                curNav.declNames = decodeURIComponent(parts[1]).split(".");
            }
        }
        if (domSearch.value !== curNavSearch) {
            domSearch.value = curNavSearch;
        }
        render();
    }

    function findSubDecl(parentType, childName) {
        if (parentType.pubDecls == null) throw new Error("parent object has no public decls");
        for (var i = 0; i < parentType.pubDecls.length; i += 1) {
            var declIndex = parentType.pubDecls[i];
            var childDecl = zigAnalysis.decls[declIndex];
            if (childDecl.name === childName) {
                return childDecl;
            }
        }
        return null;
    }

    function getDeclContainerType(decl) {
        if (decl.type === typeTypeId) {
            return zigAnalysis.types[decl.value];
        }
        return null;
    }

    function computeCanonicalPackagePaths() {
        var list = new Array(zigAnalysis.packages.length);
        // Now we try to find all the packages from root.
        var rootPkg = zigAnalysis.packages[zigAnalysis.rootPkg];
        // Breadth-first to keep the path shortest possible.
        var stack = [{
            path: [],
            pkg: rootPkg,
        }];
        while (stack.length !== 0) {
            var item = stack.pop();
            for (var key in item.pkg.table) {
                var childPkgIndex = item.pkg.table[key];
                if (list[childPkgIndex] != null) continue;

                var newPath = item.path.concat([key])
                list[childPkgIndex] = newPath;
                var childPkg = zigAnalysis.packages[childPkgIndex];
                stack.push({
                    path: newPath,
                    pkg: childPkg,
                });
            }
        }
        return list;
    }

    function markdown(mdText) {
        return mdText.replace(/[&"<>]/g, function (m) {
            return escapeHtmlReplacements[m];
        });
    }

    function onSearchKeyDown(ev) {
        switch (ev.which) {
            case 27:
                domSearch.value = "";
                domSearch.blur();
                ev.preventDefault();
                break;
        }
        ev.stopPropagation();
        startAsyncSearch();
    }

    function onWindowKeyDown(ev) {
        switch (ev.which) {
            case 83:
                domSearch.focus();
                ev.preventDefault();
                ev.stopPropagation();
                startAsyncSearch();
                break;
        }
    }

    function clearAsyncSearch() {
        if (searchTimer != null) clearTimeout(searchTimer);
    }

    function startAsyncSearch() {
        clearAsyncSearch();
        searchTimer = setTimeout(startSearch, 50);
    }
    function startSearch() {
        var parts = location.hash.split("?");
        var newPart2 = (domSearch.value === "") ? "" : ("?" + domSearch.value);
        if (parts.length === 1) {
            location.hash = location.hash + newPart2;
        } else {
            location.hash = parts[0] + newPart2;
        }
    }
    function renderSearch() {
        var matchedDecls = [];
        var terms = curNavSearch.split(/[ \r\n\t]+/);
        decl_loop: for (var declIndex = 0; declIndex < zigAnalysis.decls.length; declIndex += 1) {
            var decl = zigAnalysis.decls[declIndex];
            for (var termIndex = 0; termIndex < terms.length; termIndex += 1) {
                var term = terms[termIndex];
                if (decl.name.indexOf(term) >= 0) {
                    continue;
                }
                var astNode = zigAnalysis.astNodes[decl.src]
                if (astNode.docs != null && astNode.docs.indexOf(term) >= 0) {
                    continue;
                }
                var file = zigAnalysis.files[astNode.file];
                if (file.indexOf(term) >= 0) {
                    continue;
                }

                continue decl_loop;
            }

            matchedDecls.push(decl);
        }

        if (matchedDecls.length !== 0) {
            resizeDomList(domListSearchResults, matchedDecls.length, '<li></li>');

            for (var i = 0; i < matchedDecls.length; i += 1) {
                var liDom = domListSearchResults.children[i];
                var decl = matchedDecls[i];
                liDom.textContent = decl.name;
            }

            domSectSearchResults.classList.remove("hidden");
        } else {
            domSectSearchNoResults.classList.remove("hidden");
        }
    }
})();